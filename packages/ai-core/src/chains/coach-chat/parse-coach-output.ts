import { CoachChatOutputSchema, type CoachChatOutput } from '@fitness/shared';
import { AiCoreError } from '../../errors';
import { parseJsonWithSchema } from '../../parsers/json-zod';

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

const ALLOWED_ACTIONS = new Set(['GENERATE_WORKOUT', 'GENERATE_MEAL', 'MEAL_VISION']);

function normalizeSuggestedActions(raw: unknown): CoachChatOutput['suggestedActions'] {
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const items = raw
    .filter(
      (item): item is { action: string; label: string } =>
        typeof item === 'object' &&
        item != null &&
        typeof (item as { action?: unknown }).action === 'string' &&
        typeof (item as { label?: unknown }).label === 'string' &&
        ALLOWED_ACTIONS.has((item as { action: string }).action),
    )
    .slice(0, 4)
    .map((item) => ({
      action: item.action as 'GENERATE_WORKOUT' | 'GENERATE_MEAL' | 'MEAL_VISION',
      label: item.label.slice(0, 64),
    }));
  return items.length > 0 ? items : undefined;
}

function coerceCoachOutput(parsed: unknown): CoachChatOutput | null {
  if (typeof parsed !== 'object' || parsed == null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const reply =
    typeof record.reply === 'string'
      ? record.reply.trim()
      : typeof record.message === 'string'
        ? record.message.trim()
        : typeof record.content === 'string'
          ? record.content.trim()
          : '';
  if (!reply) {
    return null;
  }
  return CoachChatOutputSchema.parse({
    reply: reply.slice(0, 8000),
    suggestedActions: normalizeSuggestedActions(record.suggestedActions),
  });
}

/**
 * 解析 Coach 回复。优先 Zod 校验；失败时尝试容错（纯文本 / 缺字段 / 别名 reply）。
 * 避免模型 JSON 格式不完美导致整轮聊天失败。
 */
export function parseCoachChatOutput(rawText: string): CoachChatOutput {
  try {
    return parseJsonWithSchema(CoachChatOutputSchema, rawText, 'CoachChat');
  } catch (primaryErr) {
    const trimmed = rawText.trim();
    if (!trimmed) {
      throw primaryErr;
    }

    try {
      const jsonText = extractJsonText(trimmed);
      const parsed = JSON.parse(jsonText) as unknown;
      const coerced = coerceCoachOutput(parsed);
      if (coerced) {
        return coerced;
      }
    } catch {
      // fall through to plain-text fallback
    }

    if (!trimmed.startsWith('{')) {
      return { reply: trimmed.slice(0, 8000) };
    }

    if (primaryErr instanceof AiCoreError) {
      throw primaryErr;
    }
    throw new AiCoreError('AI_TASK_PARSE_FAILED', 'CoachChat 无法解析模型输出', primaryErr);
  }
}
