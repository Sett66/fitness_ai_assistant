import type {
  HealthMetricItem,
  HealthOtherItem,
  HealthReportMetrics,
  MetricFlag,
} from '../schemas/health-report';
import { getMetricByKey, resolveMetricKey } from '../constants/health-metrics';

type RawMetric = {
  key?: string;
  nameZh: string;
  value: number | string;
  unit: string;
  refLow?: number;
  refHigh?: number;
  flag: MetricFlag;
  edited?: boolean;
};

/** 单位与 key 强绑定：防止 VLM 把血常规数值错贴到心率/血压等 catalog key */
const STRICT_UNIT_PATTERNS: Partial<Record<string, RegExp>> = {
  RHR: /bpm|次\/分|次\/min|beats/i,
  SBP: /mmhg|毫米汞柱/i,
  DBP: /mmhg|毫米汞柱/i,
};

export function normalizeReportMetrics(metrics: HealthReportMetrics): HealthReportMetrics {
  const items: HealthMetricItem[] = [];
  const otherItems: HealthOtherItem[] = [];
  const seenKeys = new Set<string>();

  for (const raw of [...metrics.items, ...metrics.otherItems]) {
    const resolved = resolveRawMetric(raw);
    if (!resolved) {
      otherItems.push(toOtherItem(raw));
      continue;
    }

    if (seenKeys.has(resolved.key)) {
      continue;
    }

    seenKeys.add(resolved.key);
    items.push(resolved);
  }

  return {
    ...metrics,
    items,
    otherItems,
  };
}

function resolveRawMetric(raw: RawMetric): HealthMetricItem | null {
  const keyFromName = resolveMetricKey(raw.nameZh);
  const keyFromField =
    (raw.key && getMetricByKey(raw.key) ? raw.key : undefined) ??
    (raw.key ? resolveMetricKey(raw.key) : undefined);

  const key = keyFromName ?? keyFromField;
  if (!key) {
    return null;
  }

  const catalog = getMetricByKey(key);
  if (!catalog) {
    return null;
  }

  if (!isUnitCompatible(key, catalog.unit, raw.unit)) {
    return null;
  }

  return {
    key,
    nameZh: raw.nameZh.trim() || catalog.nameZh,
    value: raw.value,
    unit: raw.unit.trim() || catalog.unit,
    refLow: raw.refLow,
    refHigh: raw.refHigh,
    flag: raw.flag,
    edited: raw.edited,
  };
}

function toOtherItem(raw: RawMetric): HealthOtherItem {
  return {
    nameZh: raw.nameZh,
    value: raw.value,
    unit: raw.unit,
    flag: raw.flag,
  };
}

function isUnitCompatible(key: string, catalogUnit: string, actualUnit: string): boolean {
  const actual = normalizeUnit(actualUnit);
  if (!actual) {
    return false;
  }

  const strictPattern = STRICT_UNIT_PATTERNS[key];
  if (strictPattern) {
    return strictPattern.test(actual);
  }

  const expected = normalizeUnit(catalogUnit);
  if (actual === expected) {
    return true;
  }

  // 允许常见写法差异：10^9/L vs 10^9/l，g/L vs g/l
  return actual.replace(/\^/g, '') === expected.replace(/\^/g, '');
}

function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/\s+/g, '');
}
