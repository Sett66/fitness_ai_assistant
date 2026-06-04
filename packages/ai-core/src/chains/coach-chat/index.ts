import { LLM_MODELS } from '@fitness/shared';
import { createDeepSeekClient } from '../../llm/deepseek';
import type { ChatMessage, JsonChatClient, LlmUsage } from '../../llm/types';
import { COACH_SYSTEM_PROMPT } from '../../prompts/coach-system';
import { buildCoachContextBlock } from './context';
import { parseCoachChatOutput } from './parse-coach-output';
import { RunCoachChatInputSchema, type CoachChatOutput, type RunCoachChatInput } from './schema';

export type CoachChatResult = {
  result: CoachChatOutput;
  usage: LlmUsage;
  rawText: string;
};

export const runCoachChat = async (
  input: unknown,
  options?: { model?: string; client?: JsonChatClient },
): Promise<CoachChatResult> => {
  const parsed = RunCoachChatInputSchema.parse(input);
  const contextBlock = buildCoachContextBlock(parsed.userContext);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `${COACH_SYSTEM_PROMPT}\n\n【用户上下文】\n${contextBlock}`,
    },
    ...parsed.history.map((item) => ({
      role: (item.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: item.content,
    })),
    { role: 'user', content: parsed.latestUserText },
  ];

  const response = await (options?.client ?? createDeepSeekClient()).generateJson({
    model: options?.model ?? LLM_MODELS.DEEPSEEK_V4_PRO,
    messages,
    temperature: 0.7,
  });

  return {
    result: parseCoachChatOutput(response.text),
    usage: response.usage,
    rawText: response.text,
  };
};

export type { RunCoachChatInput, CoachChatOutput };
