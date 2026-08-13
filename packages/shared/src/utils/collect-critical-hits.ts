import { getMetricByKey } from '../constants/health-metrics';
import type { HealthReportMetrics } from '../schemas/health-report';

/** 用 catalog 的 criticalLow/High 比对 metrics，返回命中的 metricKey 列表（去重保序）。 */
export function collectCriticalHits(metrics: HealthReportMetrics): string[] {
  const hits: string[] = [];
  const seen = new Set<string>();

  for (const item of metrics.items) {
    const catalog = getMetricByKey(item.key);
    if (!catalog) continue;

    const value = toNumericMetricValue(item.value);
    if (value == null) continue;

    const hitLow = catalog.criticalLow != null && value <= catalog.criticalLow;
    const hitHigh = catalog.criticalHigh != null && value >= catalog.criticalHigh;
    if (!hitLow && !hitHigh) continue;
    if (seen.has(item.key)) continue;

    seen.add(item.key);
    hits.push(item.key);
  }

  return hits;
}

export function toNumericMetricValue(value: number | string): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}
