import { getMetricByKey } from '../constants/health-metrics';
import type {
  HealthMetricItem,
  HealthOtherItem,
  HealthReportMetrics,
  UpdateHealthReportMetricsRequest,
} from '../schemas/health-report';

export type ApplyMetricEditsError =
  | { code: 'INVALID_KEY'; keys: string[] }
  | { code: 'DUPLICATE_KEY'; keys: string[] };

export type ApplyMetricEditsResult =
  | { ok: true; metrics: HealthReportMetrics }
  | { ok: false; error: ApplyMetricEditsError };

/** 全量提交修正后的 items：校验 catalog key、标记被改/新认领项 edited=true。 */
export function applyHealthReportMetricEdits(
  existing: HealthReportMetrics | null,
  submitted: UpdateHealthReportMetricsRequest,
): ApplyMetricEditsResult {
  const invalidKeys = [
    ...new Set(submitted.items.map((item) => item.key).filter((key) => !getMetricByKey(key))),
  ];
  if (invalidKeys.length > 0) {
    return { ok: false, error: { code: 'INVALID_KEY', keys: invalidKeys } };
  }

  const seen = new Set<string>();
  const duplicateKeys: string[] = [];
  for (const item of submitted.items) {
    if (seen.has(item.key)) {
      duplicateKeys.push(item.key);
      continue;
    }
    seen.add(item.key);
  }
  if (duplicateKeys.length > 0) {
    return { ok: false, error: { code: 'DUPLICATE_KEY', keys: [...new Set(duplicateKeys)] } };
  }

  const previousByKey = new Map((existing?.items ?? []).map((item) => [item.key, item]));
  const items = submitted.items.map((item) => {
    const previous = previousByKey.get(item.key);
    const edited = previous ? previous.edited === true || !sameMetricPayload(previous, item) : true;
    return {
      ...item,
      nameZh: item.nameZh.trim() || (getMetricByKey(item.key)?.nameZh ?? item.key),
      edited: edited || undefined,
    };
  });

  return {
    ok: true,
    metrics: {
      reportDate: existing?.reportDate,
      summaryText: existing?.summaryText,
      items,
      otherItems: submitted.otherItems ?? existing?.otherItems ?? [],
    },
  };
}

function sameMetricPayload(a: HealthMetricItem, b: HealthMetricItem): boolean {
  return metricPayloadSignature(a) === metricPayloadSignature(b);
}

function metricPayloadSignature(item: HealthMetricItem | HealthOtherItem): string {
  return JSON.stringify({
    value: item.value,
    unit: item.unit,
    flag: item.flag,
    nameZh: item.nameZh,
    refLow: item.refLow ?? null,
    refHigh: item.refHigh ?? null,
    refText: item.refText ?? null,
  });
}
