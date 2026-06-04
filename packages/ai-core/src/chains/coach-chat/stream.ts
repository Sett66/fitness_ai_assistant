import { CoachChatOutputSchema, LLM_MODELS } from '@fitness/shared';
import { mergeLlmUsage } from '../meal-vision/advice';
import { createDeepSeekClient } from '../../llm/deepseek';
import type { OpenAiCompatibleJsonClient } from '../../llm/openai-compatible';
import type { ChatMessage, LlmUsage } from '../../llm/types';
import {
  COACH_STREAM_SYSTEM_PROMPT,
  COACH_SUGGESTED_ACTIONS_PROMPT,
} from '../../prompts/coach-system';
import { buildCoachContextBlock } from './context';
import { RunCoachChatInputSchema, type CoachChatOutput, type RunCoachChatInput } from './schema';

export type CoachChatStreamChunk = {
  delta: string;
  text: string;
};

export type CoachChatStreamResult = {
  reply: string;
  suggestedActions?: CoachChatOutput['suggestedActions'];
  usage: LlmUsage;
};

const inferSuggestedActions = async (
  latestUserText: string,
  reply: string,
  options?: { model?: string; client?: OpenAiCompatibleJsonClient },
): Promise<{ suggestedActions?: CoachChatOutput['suggestedActions']; usage: LlmUsage }> => {
  const client = options?.client ?? createDeepSeekClient();
  const messages: ChatMessage[] = [
    { role: 'system', content: COACH_SUGGESTED_ACTIONS_PROMPT },
    {
      role: 'user',
      content: `【用户问题】\n${latestUserText}\n\n【助手回复】\n${reply.slice(0, 4000)}`,
    },
  ];

  const response = await client.generateJson({
    model: options?.model ?? LLM_MODELS.DEEPSEEK_V4_PRO,
    messages,
    temperature: 0.2,
  });

  try {
    const parsed = CoachChatOutputSchema.parse(JSON.parse(response.text));
    return { suggestedActions: parsed.suggestedActions, usage: response.usage };
  } catch {
    return { suggestedActions: undefined, usage: response.usage };
  }
};

export async function* runCoachChatStream(
  input: unknown,
  options?: { model?: string; client?: OpenAiCompatibleJsonClient },
): AsyncGenerator<CoachChatStreamChunk, CoachChatStreamResult> {
  const parsed = RunCoachChatInputSchema.parse(input);
  const contextBlock = buildCoachContextBlock(parsed.userContext);
  const client = options?.client ?? createDeepSeekClient();
  const model = options?.model ?? LLM_MODELS.DEEPSEEK_V4_PRO;

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${COACH_STREAM_SYSTEM_PROMPT}\n\n【用户上下文】\n${contextBlock}`,
    },
    ...parsed.history.map((item) => ({
      role: (item.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: item.content,
    })),
    { role: 'user', content: parsed.latestUserText },
  ];

  let streamUsage: LlmUsage = { tokenIn: 0, tokenOut: 0, costCny: 0 };
  let reply = '';

  for await (const chunk of client.streamText({ model, messages, temperature: 0.7 })) {
    reply = chunk.text;
    if (chunk.usage) {
      streamUsage = chunk.usage;
    }
    yield { delta: chunk.delta, text: chunk.text };
  }

  const actionsResult = await inferSuggestedActions(parsed.latestUserText, reply, {
    model,
    client,
  });

  return {
    reply: reply.slice(0, 8000),
    suggestedActions: actionsResult.suggestedActions,
    usage: mergeLlmUsage(streamUsage, actionsResult.usage),
  };
}

export type { RunCoachChatInput, CoachChatOutput };
