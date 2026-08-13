import type {
  HealthMetricItem,
  HealthOtherItem,
  HealthReportMetrics,
  MetricFlag,
} from '../schemas/health-report';
import { getMetricByKey, resolveMetricKey } from '../constants/health-metrics';
import { isQualitativeMetricValue } from './format-metric-display';

type RawMetric = {
  key?: string;
  nameZh: string;
  value: number | string;
  unit: string;
  refLow?: number;
  refHigh?: number;
  refText?: string;
  flag: MetricFlag;
  edited?: boolean;
};

/** 单位与 key 强绑定：防止 VLM 把检验数值错贴到其他 catalog key */
const STRICT_UNIT_PATTERNS: Partial<Record<string, RegExp>> = {
  RHR: /bpm|次\/分|次\/min|beats/i,
  SBP: /mmhg|毫米汞柱/i,
  DBP: /mmhg|毫米汞柱/i,
};

/** 仅接受数值型结果的关键指标（尿检/定性项不在此列） */
const NUMERIC_REQUIRED_KEYS = new Set([
  'FPG',
  'HBA1C',
  'BMI',
  'SBP',
  'DBP',
  'RHR',
  'TC',
  'TG',
  'HDL',
  'LDL',
  'UA',
  'ALT',
  'AST',
  'GGT',
  'ALB',
  'TP',
  'ALP',
  'CREATININE',
  'EGFR',
  'HGB',
  'WBC',
  'RBC',
  'PLT',
  'TSH',
  'TESTOSTERONE',
  'CORTISOL',
  'SHBG',
]);

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
  const key = pickMetricKey(raw);
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

  if (NUMERIC_REQUIRED_KEYS.has(key) && isQualitativeMetricValue(raw.value)) {
    return null;
  }

  return {
    key,
    nameZh: raw.nameZh.trim() || catalog.nameZh,
    value: raw.value,
    unit: raw.unit.trim() || catalog.unit,
    refLow: raw.refLow,
    refHigh: raw.refHigh,
    refText: raw.refText,
    flag: raw.flag,
    edited: raw.edited,
  };
}

function pickMetricKey(raw: RawMetric): string | undefined {
  const fromName = resolveMetricKey(raw.nameZh);
  const fromField =
    (raw.key && getMetricByKey(raw.key) ? raw.key : undefined) ??
    (raw.key ? resolveMetricKey(raw.key) : undefined);

  const contextual = resolveContextualKey(raw);
  if (contextual) {
    return contextual;
  }

  const candidate = fromName ?? fromField;
  if (!candidate) {
    return undefined;
  }

  // 模型 key 与 nameZh 冲突时，优先 nameZh（如 key=FPG 但 nameZh=尿蛋白）
  if (fromName && fromField && fromName !== fromField) {
    return fromName;
  }

  return candidate;
}

function resolveContextualKey(raw: RawMetric): string | undefined {
  const name = raw.nameZh.trim();
  const unit = normalizeUnit(raw.unit);
  const qualitative = isQualitativeMetricValue(raw.value);

  if (name === '白细胞' && /cells\/ul|cell\/ul/.test(unit)) {
    return 'URINE_WBC';
  }

  if (name === '蛋白质' || name === '尿蛋白') {
    return 'URINE_PROTEIN';
  }

  if (name === '葡萄糖' || name === '尿糖') {
    return qualitative ? 'URINE_GLU' : 'URINE_GLU';
  }

  if (name === '总蛋白') {
    return 'TP';
  }

  if (raw.key === 'FPG' && qualitative) {
    return 'URINE_GLU';
  }

  if (fromFpgContext(name, raw.value)) {
    return 'FPG';
  }

  return undefined;
}

function fromFpgContext(nameZh: string, value: number | string): boolean {
  if (isQualitativeMetricValue(value)) {
    return false;
  }
  return /空腹|血糖|FPG|GLU/i.test(nameZh);
}

function toOtherItem(raw: RawMetric): HealthOtherItem {
  return {
    nameZh: raw.nameZh,
    value: raw.value,
    unit: raw.unit,
    refLow: raw.refLow,
    refHigh: raw.refHigh,
    refText: raw.refText,
    flag: raw.flag,
  };
}

function isUnitCompatible(key: string, catalogUnit: string, actualUnit: string): boolean {
  const actual = normalizeUnit(actualUnit);
  const expected = normalizeUnit(catalogUnit);

  if (!actual && !expected) {
    return true;
  }

  if (!actual && expected) {
    // 定性尿检项常无单位或单位为空
    return key.startsWith('URINE_') || key === 'AG_RATIO';
  }

  const strictPattern = STRICT_UNIT_PATTERNS[key];
  if (strictPattern) {
    return strictPattern.test(actual);
  }

  if (actual === expected) {
    return true;
  }

  if (key === 'URINE_WBC' && /cells\/ul|cell\/ul/.test(actual)) {
    return true;
  }

  if (key === 'URINE_PROTEIN' && (actual === 'g/l' || actual === '')) {
    return true;
  }

  return actual.replace(/\^/g, '') === expected.replace(/\^/g, '');
}

function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/\s+/g, '');
}
