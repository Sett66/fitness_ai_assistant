type RefFields = {
  refLow?: number;
  refHigh?: number;
  refText?: string;
};

const RANGE_PATTERN = /^(\d+(?:\.\d+)?)\s*[-~～—–]{1,2}\s*(\d+(?:\.\d+)?)$/;

/** VLM 输出进入 Zod 前：保留「阴性」等文字参考，并把 "130--175" / "3.5" 字符串规范为数字 */
export function sanitizeReportMetricsJson(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw == null) {
    return raw;
  }

  const obj = raw as Record<string, unknown>;
  return {
    ...obj,
    items: Array.isArray(obj.items) ? obj.items.map(sanitizeMetricRow) : [],
    otherItems: Array.isArray(obj.otherItems) ? obj.otherItems.map(sanitizeMetricRow) : [],
  };
}

function sanitizeMetricRow(item: unknown): Record<string, unknown> {
  if (typeof item !== 'object' || item == null) {
    return {};
  }

  const row = { ...(item as Record<string, unknown>) };
  const refs = parseReferenceFields(
    row.refLow,
    row.refHigh,
    row.refRange,
    row.reference,
    row.refText,
  );

  if (refs.refLow != null) row.refLow = refs.refLow;
  else delete row.refLow;

  if (refs.refHigh != null) row.refHigh = refs.refHigh;
  else delete row.refHigh;

  if (refs.refText) row.refText = refs.refText;
  else delete row.refText;

  delete row.refRange;
  delete row.reference;

  return row;
}

function parseReferenceFields(...candidates: unknown[]): RefFields {
  const texts: string[] = [];
  let refLow: number | undefined;
  let refHigh: number | undefined;

  for (const candidate of candidates) {
    if (candidate == null || candidate === '') {
      continue;
    }

    if (typeof candidate === 'number' && !Number.isNaN(candidate)) {
      if (refLow == null) refLow = candidate;
      else if (refHigh == null) refHigh = candidate;
      continue;
    }

    const text = String(candidate).trim();
    if (!text) {
      continue;
    }

    const range = tryParseRangeString(text);
    if (range) {
      refLow = range.refLow;
      refHigh = range.refHigh;
      continue;
    }

    const asNumber = tryParseNumberString(text);
    if (asNumber != null) {
      if (refLow == null) refLow = asNumber;
      else if (refHigh == null) refHigh = asNumber;
      continue;
    }

    texts.push(text);
  }

  const refText = texts.length > 0 ? texts.join('；') : undefined;
  return { refLow, refHigh, refText };
}

function tryParseRangeString(value: string): { refLow: number; refHigh: number } | null {
  const match = value.trim().match(RANGE_PATTERN);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return { refLow: Number(match[1]), refHigh: Number(match[2]) };
}

function tryParseNumberString(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return undefined;
  }
  return Number(trimmed);
}
