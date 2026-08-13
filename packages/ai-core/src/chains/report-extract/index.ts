import type { HealthReportMetrics } from '@fitness/shared';
import {
  HealthReportMetricsSchema,
  LLM_MODELS,
  normalizeReportMetrics,
  sanitizeReportMetricsJson,
} from '@fitness/shared';
import { createQwenVlClient } from '../../llm/qwen-vl';
import type { JsonChatClient, LlmUsage } from '../../llm/types';
import { parseJsonWithSchema } from '../../parsers/json-zod';
import { REPORT_EXTRACT_PROMPT } from '../../prompts/report-extract';
import { RunReportExtractInputSchema, type RunReportExtractInput } from './schema';

export type ReportExtractOutput = {
  result: HealthReportMetrics;
  usage: LlmUsage;
  rawText: string;
};

export const runReportExtract = async (
  input: unknown,
  options?: { model?: string; client?: JsonChatClient },
): Promise<ReportExtractOutput> => {
  const parsedInput: RunReportExtractInput = RunReportExtractInputSchema.parse(input);
  const response = await (options?.client ?? createQwenVlClient()).generateJson({
    model: options?.model ?? LLM_MODELS.QWEN_VL_MAX,
    temperature: 0.1,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${REPORT_EXTRACT_PROMPT}\n\nCatalog:\n${JSON.stringify(parsedInput.catalog)}`,
          },
          ...parsedInput.imageUrls.map((url) => ({
            type: 'image_url' as const,
            image_url: { url },
          })),
        ],
      },
    ],
  });

  const parsed = parseJsonWithSchema(
    HealthReportMetricsSchema,
    response.text,
    'HealthReportMetrics',
    sanitizeReportMetricsJson,
  );
  return {
    result: normalizeReportMetrics(parsed),
    usage: response.usage,
    rawText: response.text,
  };
};
