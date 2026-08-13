import { getMetricByKey } from '../constants/health-metrics';
import { HEALTH_CONTEXT_MAX_CHARS } from '../constants/health-report';
import type { RiskAssessment } from '../schemas/health-report';

const SEE_DOCTOR_HINT = '建议尽快就医';

export type ReportAssessPayload = {
  riskAssessment: RiskAssessment;
  healthContext: string;
};

/**
 * 危急值不完全依赖模型：命中 catalog critical 的指标强制 URGENT，
 * 并保证 seeDoctorAdvised=true、对应 finding 存在。
 */
export function applyRiskGuardrails(
  payload: ReportAssessPayload,
  criticalHits: string[],
): ReportAssessPayload {
  const findings = [...payload.riskAssessment.findings];

  for (const key of criticalHits) {
    const metric = getMetricByKey(key);
    const title = metric?.nameZh ?? key;
    const index = findings.findIndex((finding) => finding.metricKey === key);
    if (index >= 0) {
      const current = findings[index];
      if (!current) continue;
      findings[index] = {
        ...current,
        severity: 'URGENT',
        detail: ensureSeeDoctorHint(current.detail),
      };
      continue;
    }

    findings.unshift({
      metricKey: key,
      title,
      detail: `${title}达到危急值，建议尽快就医。本提示仅从健身/生活方式角度提供参考，不构成医疗诊断。`,
      severity: 'URGENT',
    });
  }

  const hasUrgent =
    criticalHits.length > 0 || findings.some((finding) => finding.severity === 'URGENT');

  return {
    riskAssessment: {
      overallSummary: payload.riskAssessment.overallSummary,
      findings,
      seeDoctorAdvised: payload.riskAssessment.seeDoctorAdvised || hasUrgent,
    },
    healthContext: truncateChars(payload.healthContext, HEALTH_CONTEXT_MAX_CHARS),
  };
}

function ensureSeeDoctorHint(detail: string): string {
  if (detail.includes(SEE_DOCTOR_HINT)) {
    return truncateChars(detail, 1024);
  }
  const suffix = ` ${SEE_DOCTOR_HINT}。`;
  return truncateChars(`${detail.trim()}${suffix}`, 1024);
}

function truncateChars(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max);
}

export function sanitizeReportAssessJson(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return parsed;
  }

  const root = { ...(parsed as Record<string, unknown>) };
  if (typeof root.healthContext === 'string') {
    root.healthContext = truncateChars(root.healthContext, HEALTH_CONTEXT_MAX_CHARS);
  }

  const assessment = root.riskAssessment;
  if (assessment && typeof assessment === 'object' && !Array.isArray(assessment)) {
    const next = { ...(assessment as Record<string, unknown>) };
    if (typeof next.overallSummary === 'string') {
      next.overallSummary = truncateChars(next.overallSummary, 2048);
    }
    if (Array.isArray(next.findings)) {
      next.findings = next.findings.map((finding) => {
        if (!finding || typeof finding !== 'object' || Array.isArray(finding)) {
          return finding;
        }
        const item = { ...(finding as Record<string, unknown>) };
        if (typeof item.title === 'string') {
          item.title = truncateChars(item.title, 120);
        }
        if (typeof item.detail === 'string') {
          item.detail = truncateChars(item.detail, 1024);
        }
        return item;
      });
    }
    root.riskAssessment = next;
  }

  return root;
}
