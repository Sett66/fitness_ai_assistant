import { LLM_MODELS } from '@fitness/shared';
import type {
  AgentMemoryFact,
  CoachToolTraceItem,
  LocationContext,
  UserAiContext,
} from '@fitness/shared';

import { buildCoachSystemPrompt } from '../../chains/coach-chat/build-system-prompt';
import { stampCoachMessageContent } from '../../chains/coach-chat/format-chat-time';
import { inferSuggestedActions } from '../../chains/coach-chat/infer-suggested-actions';
import type { CoachChatHistoryItem } from '../../chains/coach-chat/schema';
import { mergeLlmUsage } from '../../chains/meal-vision/advice';
import { createDeepSeekClient } from '../../llm/deepseek';
import type { CoachChatLlmClient } from '../../llm/tracing-client';
import type { AgentChatMessage } from '../../llm/tool-types';
import type { LlmUsage } from '../../llm/types';
import {
  runCoachAgentToolLoopStream,
  type CreateCoachAgentGraphOptions,
  type InvokeToolFn,
} from './graph';
import {
  buildMessagesForFinalStream,
  finalizeAgentReply,
  stripDsmlMarkup,
} from './sanitize-agent-reply';
import { type CoachAgentStreamEvent, emptyCoachAgentUsage } from './state';

export type RunCoachAgentStreamInput = {
  latestUserText: string;
  history: CoachChatHistoryItem[];
  userContext: UserAiContext;
  memoryFacts?: AgentMemoryFact[];
  locationContext?: LocationContext;
  timezoneOffsetMinutes: number;
  now?: Date;
};

export type CoachAgentStreamDoneEvent = {
  type: 'done';
  reply: string;
  suggestedActions?: Awaited<ReturnType<typeof inferSuggestedActions>>['suggestedActions'];
  usage: LlmUsage;
  toolTrace: CoachToolTraceItem[];
};

export type CoachAgentRunnerEvent = CoachAgentStreamEvent | CoachAgentStreamDoneEvent;

export type RunCoachAgentStreamOptions = CreateCoachAgentGraphOptions & {
  client?: CoachChatLlmClient;
};

const buildInitialMessages = (input: RunCoachAgentStreamInput): AgentChatMessage[] => {
  const now = input.now ?? new Date();
  const systemPrompt = buildCoachSystemPrompt({
    userContext: input.userContext,
    memoryFacts: input.memoryFacts,
    locationContext: input.locationContext,
    mode: 'agent',
    timezoneOffsetMinutes: input.timezoneOffsetMinutes,
    now,
  });

  const historyMessages: AgentChatMessage[] = input.history.map((item) => ({
    role: item.role === 'USER' ? 'user' : 'assistant',
    content: stampCoachMessageContent(
      item.content,
      item.createdAt,
      now,
      input.timezoneOffsetMinutes,
    ),
  }));

  return [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    {
      role: 'user',
      content: stampCoachMessageContent(
        input.latestUserText,
        now,
        now,
        input.timezoneOffsetMinutes,
      ),
    },
  ];
};

export async function* runCoachAgentStream(
  input: RunCoachAgentStreamInput,
  options: RunCoachAgentStreamOptions,
): AsyncGenerator<CoachAgentRunnerEvent, CoachAgentStreamDoneEvent> {
  const client = options.client ?? createDeepSeekClient();
  const model = options.model ?? LLM_MODELS.DEEPSEEK_V4_PRO;
  const initialMessages = buildInitialMessages(input);

  const toolLoop = runCoachAgentToolLoopStream(initialMessages, options);
  let toolLoopResult = await toolLoop.next();
  while (!toolLoopResult.done) {
    yield toolLoopResult.value;
    toolLoopResult = await toolLoop.next();
  }

  const graphState = toolLoopResult.value;

  let streamUsage = graphState.usage ?? emptyCoachAgentUsage();
  let rawReply = '';
  const finalMessages = buildMessagesForFinalStream(graphState.messages);

  for await (const chunk of client.streamText({
    model,
    messages: finalMessages,
    temperature: 0.7,
  })) {
    rawReply = chunk.text;
    if (chunk.usage) {
      streamUsage = mergeLlmUsage(streamUsage, chunk.usage);
    }
    const sanitized = stripDsmlMarkup(rawReply);
    yield { type: 'delta', text: sanitized || rawReply };
  }

  const reply = finalizeAgentReply(rawReply, graphState.messages);

  const streamed = stripDsmlMarkup(rawReply);
  if (reply && reply !== streamed) {
    yield { type: 'delta', text: reply };
  }

  const actionsResult = await inferSuggestedActions(input.latestUserText, reply, {
    model,
    client,
  });

  const doneEvent: CoachAgentStreamDoneEvent = {
    type: 'done',
    reply,
    suggestedActions: actionsResult.suggestedActions,
    usage: mergeLlmUsage(streamUsage, actionsResult.usage),
    toolTrace: graphState.toolTrace,
  };

  yield doneEvent;
  return doneEvent;
}

export type { InvokeToolFn, CreateCoachAgentGraphOptions };
export { MAX_TOOL_ITERATIONS } from './state';
export { createCoachAgentGraph } from './graph';
