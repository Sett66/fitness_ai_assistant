import { LLM_MODELS } from '@fitness/shared';
import { mergeLlmUsage } from '../meal-vision/advice';
import { createDeepSeekClient } from '../../llm/deepseek';
import type { OpenAiCompatibleJsonClient } from '../../llm/openai-compatible';
import type { ChatMessage, LlmUsage } from '../../llm/types';
import { buildCoachSystemPrompt } from './build-system-prompt';
import { inferSuggestedActions } from './infer-suggested-actions';
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

export async function* runCoachChatStream(
  input: unknown,
  options?: { model?: string; client?: OpenAiCompatibleJsonClient },
): AsyncGenerator<CoachChatStreamChunk, CoachChatStreamResult> {
  const parsed = RunCoachChatInputSchema.parse(input);
  const client = options?.client ?? createDeepSeekClient();
  const model = options?.model ?? LLM_MODELS.DEEPSEEK_V4_PRO;

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: buildCoachSystemPrompt({
        userContext: parsed.userContext,
        memoryFacts: parsed.memoryFacts,
        mode: 'stream',
      }),
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
