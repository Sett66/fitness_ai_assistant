import { applyRiskGuardrails, LLM_MODELS, sanitizeReportAssessJson } from '@fitness/shared';
import { createDeepSeekClient } from '../../llm/deepseek';
import type { JsonChatClient, LlmUsage } from '../../llm/types';
import { parseJsonWithSchema } from '../../parsers/json-zod';
import { REPORT_ASSESS_PROMPT } from '../../prompts/report-assess';
import {
  ReportAssessOutputSchema,
  RunReportAssessInputSchema,
  type ReportAssessOutput,
  type RunReportAssessInput,
} from './schema';

export type ReportAssessResult = {
  result: ReportAssessOutput;
  usage: LlmUsage;
  rawText: string;
};

export const runReportAssess = async (
  input: unknown,
  options?: { model?: string; client?: JsonChatClient },
): Promise<ReportAssessResult> => {
  const parsedInput: RunReportAssessInput = RunReportAssessInputSchema.parse(input);
  const response = await (options?.client ?? createDeepSeekClient()).generateJson({
    model: options?.model ?? LLM_MODELS.DEEPSEEK_V4_PRO,
    temperature: 0.2,
    messages: [
      { role: 'system', content: REPORT_ASSESS_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          metrics: parsedInput.metrics,
          profile: toAssessProfilePayload(parsedInput.profile),
          criticalHits: parsedInput.criticalHits,
        }),
      },
    ],
  });

  const parsed = parseJsonWithSchema(
    ReportAssessOutputSchema,
    response.text,
    'ReportAssess',
    sanitizeReportAssessJson,
  );

  return {
    result: applyRiskGuardrails(parsed, parsedInput.criticalHits),
    usage: response.usage,
    rawText: response.text,
  };
};

function toAssessProfilePayload(
  profile: RunReportAssessInput['profile'],
): Record<string, unknown> | null {
  if (!profile) return null;

  return {
    gender: profile.gender ?? null,
    ageYears: ageFromBirthDate(profile.birthDate),
    heightCm: profile.heightCm ?? null,
    weightKg: profile.weightKg ?? null,
    trainingYears: profile.trainingYears ?? null,
    goal: profile.goal ?? null,
  };
}

function ageFromBirthDate(birthDate?: Date): number | null {
  if (!birthDate) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }
  return age >= 0 && age < 120 ? age : null;
}

export type { ReportAssessOutput };
