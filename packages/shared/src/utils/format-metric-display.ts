/** 尿检/定性结果常见取值，展示时不应拼接数值型单位 */
const SEMI_QUANT_PATTERN = /^[+-]+$/;
const QUALITATIVE_LABELS = new Set(['-', '阴性', '阳性', 'norm.', '少见', '清晰', '浅黄', '正常']);

export function isQualitativeMetricValue(value: number | string): boolean {
  if (typeof value === 'number') {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  const lower = trimmed.toLowerCase();
  if (QUALITATIVE_LABELS.has(lower) || QUALITATIVE_LABELS.has(trimmed)) {
    return true;
  }
  if (SEMI_QUANT_PATTERN.test(trimmed) || trimmed === '±') {
    return true;
  }
  return Number.isNaN(Number(trimmed));
}

export function formatMetricDisplayValue(value: number | string, unit?: string): string {
  const text = String(value).trim();
  const lower = text.toLowerCase();

  if (text === '-' || lower === '阴性') {
    return '阴性';
  }
  if (lower === 'norm.') {
    return '正常';
  }
  if (SEMI_QUANT_PATTERN.test(text) || text === '±') {
    return text;
  }
  if (!unit || isQualitativeMetricValue(value)) {
    return text;
  }

  return `${text} ${unit}`.trim();
}
