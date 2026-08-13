import {
  HEALTH_CONTEXT_FRESHNESS_MONTHS,
  HEALTH_CONTEXT_MAX_CHARS,
} from '../constants/health-report';

export type HealthContextCandidate = {
  healthContext: string | null;
  reportDate: Date | null;
  createdAt: Date;
};

/** 新鲜度锚点：优先体检单日期，缺省则用上传/创建时间 */
export function resolveHealthReportAnchorDate(report: HealthContextCandidate): Date {
  return report.reportDate ?? report.createdAt;
}

export function getHealthContextFreshnessCutoff(
  now: Date = new Date(),
  months: number = HEALTH_CONTEXT_FRESHNESS_MONTHS,
): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - months,
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
      now.getUTCMilliseconds(),
    ),
  );
}

export function isHealthContextFresh(
  report: HealthContextCandidate,
  now: Date = new Date(),
): boolean {
  return (
    resolveHealthReportAnchorDate(report).getTime() >=
    getHealthContextFreshnessCutoff(now).getTime()
  );
}

/**
 * 在已是 DONE、未软删的候选中，取最新一份仍在新鲜度窗口内的 healthContext。
 * 「最新」按 createdAt（完成分析的时间）降序。
 */
export function pickLatestHealthContext(
  reports: HealthContextCandidate[],
  now: Date = new Date(),
): string | null {
  const eligible = reports
    .map((report) => ({
      report,
      text: (report.healthContext?.trim() ?? '').slice(0, HEALTH_CONTEXT_MAX_CHARS),
    }))
    .filter((item) => item.text.length > 0 && isHealthContextFresh(item.report, now))
    .sort((a, b) => b.report.createdAt.getTime() - a.report.createdAt.getTime());

  return eligible[0]?.text ?? null;
}
