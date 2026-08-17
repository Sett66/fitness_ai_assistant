import { LLM_MODELS } from '@fitness/shared';
import { createDeepSeekClient } from '../../llm/deepseek';
import type { JsonChatClient, LlmUsage } from '../../llm/types';
import { parseJsonWithSchema } from '../../parsers/json-zod';
import { SOCIAL_MODERATE_PROMPT } from '../../prompts/social-moderate';
import {
  RunSocialModerateInputSchema,
  SocialModerateResultSchema,
  type RunSocialModerateInput,
  type SocialModerateResult,
} from './schema';

export type SocialModerateOutput = {
  result: SocialModerateResult;
  usage: LlmUsage;
  rawText: string;
};

export const runSocialModerate = async (
  input: unknown,
  options?: { model?: string; client?: JsonChatClient },
): Promise<SocialModerateOutput> => {
  const parsedInput: RunSocialModerateInput = RunSocialModerateInputSchema.parse(input);
  const response = await (options?.client ?? createDeepSeekClient()).generateJson({
    model: options?.model ?? LLM_MODELS.DEEPSEEK_V4_FLASH,
    temperature: 0.1,
    messages: [
      { role: 'system', content: SOCIAL_MODERATE_PROMPT },
      { role: 'user', content: parsedInput.body },
    ],
  });

  const parsed = parseJsonWithSchema(
    SocialModerateResultSchema,
    response.text,
    'SocialModerate',
    sanitizeSocialModerateJson,
  );

  return {
    result: parsed,
    usage: response.usage,
    rawText: response.text,
  };
};

function sanitizeSocialModerateJson(parsed: unknown): unknown {
  if (typeof parsed !== 'object' || parsed == null) return parsed;
  const row = parsed as Record<string, unknown>;
  const reason = typeof row.reason === 'string' ? row.reason.trim().slice(0, 100) : '';
  const decision = typeof row.decision === 'string' ? row.decision.toUpperCase() : row.decision;
  return { ...row, decision, reason };
}

export type { SocialModerateResult };
