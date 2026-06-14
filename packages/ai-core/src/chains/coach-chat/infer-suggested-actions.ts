import { CoachChatOutputSchema, LLM_MODELS } from '@fitness/shared';
import { createDeepSeekClient } from '../../llm/deepseek';
import type { OpenAiCompatibleJsonClient } from '../../llm/openai-compatible';
import type { ChatMessage, LlmUsage } from '../../llm/types';
import { COACH_SUGGESTED_ACTIONS_PROMPT } from '../../prompts/coach-system';
import type { CoachChatOutput } from './schema';

export const inferSuggestedActions = async (
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
