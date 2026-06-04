import type { z } from 'zod';
import { AiCoreError } from '../errors';

export const parseJsonWithSchema = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  rawText: string,
  label: string,
): z.output<TSchema> => {
  const jsonText = extractJsonText(rawText);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err: unknown) {
    throw new AiCoreError('AI_TASK_PARSE_FAILED', `${label} 不是合法 JSON`, err);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AiCoreError(
      'AI_TASK_PARSE_FAILED',
      `${label} 未通过 Zod 校验：${result.error.issues.map((issue) => issue.message).join('; ')}`,
      result.error,
    );
  }
  return result.data;
};

const extractJsonText = (rawText: string): string => {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const firstObject = trimmed.indexOf('{');
  const lastObject = trimmed.lastIndexOf('}');
  if (firstObject >= 0 && lastObject > firstObject) {
    return trimmed.slice(firstObject, lastObject + 1);
  }
  return trimmed;
};
