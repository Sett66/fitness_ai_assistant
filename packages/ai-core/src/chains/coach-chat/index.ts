import { LLM_MODELS } from '@fitness/shared';
import { createDeepSeekClient } from '../../llm/deepseek';
import type { ChatMessage, JsonChatClient, LlmUsage } from '../../llm/types';
import { buildCoachSystemPrompt } from './build-system-prompt';
import { stampCoachMessageContent } from './format-chat-time';
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

  const now = new Date();
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: buildCoachSystemPrompt({
        userContext: parsed.userContext,
        memoryFacts: parsed.memoryFacts,
        mode: 'json',
        timezoneOffsetMinutes: parsed.timezoneOffsetMinutes,
        now,
      }),
    },
    ...parsed.history.map((item) => ({
      role: (item.role === 'USER' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: stampCoachMessageContent(
        item.content,
        item.createdAt,
        now,
        parsed.timezoneOffsetMinutes,
      ),
    })),
    {
      role: 'user',
      content: stampCoachMessageContent(
        parsed.latestUserText,
        now,
        now,
        parsed.timezoneOffsetMinutes,
      ),
    },
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
