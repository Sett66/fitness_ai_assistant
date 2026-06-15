import { LLM_MODELS } from '@fitness/shared';
import type {
  AgentMemoryFact,
  CoachToolTraceItem,
  LocationContext,
  UserAiContext,
} from '@fitness/shared';

import { buildCoachSystemPrompt } from '../../chains/coach-chat/build-system-prompt';
import { inferSuggestedActions } from '../../chains/coach-chat/infer-suggested-actions';
import type { CoachChatHistoryItem } from '../../chains/coach-chat/schema';
import { mergeLlmUsage } from '../../chains/meal-vision/advice';
import { createDeepSeekClient } from '../../llm/deepseek';
import type { OpenAiCompatibleJsonClient } from '../../llm/openai-compatible';
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
  client?: OpenAiCompatibleJsonClient;
};

const buildInitialMessages = (input: RunCoachAgentStreamInput): AgentChatMessage[] => {
  const systemPrompt = buildCoachSystemPrompt({
    userContext: input.userContext,
    memoryFacts: input.memoryFacts,
    locationContext: input.locationContext,
    mode: 'agent',
  });

  const historyMessages: AgentChatMessage[] = input.history.map((item) => ({
    role: item.role === 'USER' ? 'user' : 'assistant',
    content: item.content,
  }));

  return [
    { role: 'system', content: systemPrompt },
    ...historyMessages,
    { role: 'user', content: input.latestUserText },
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
