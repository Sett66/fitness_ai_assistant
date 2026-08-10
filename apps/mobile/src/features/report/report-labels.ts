import type { HealthMetricCategory } from '@fitness/shared';

export const healthMetricCategoryLabels: Record<HealthMetricCategory, string> = {
  METABOLIC: '代谢',
  LIPID: '血脂',
  GLUCOSE: '血糖',
  LIVER: '肝功',
  KIDNEY: '肾功',
  HORMONE: '激素',
  BLOOD: '血常规',
  THYROID: '甲功',
  CARDIO: '心血管',
  BODY_COMP: '体成分',
};

export function reportStatusLabel(status: string): string {
  switch (status) {
    case 'QUEUED':
      return '排队中';
    case 'RUNNING':
      return '分析中';
    case 'DONE':
      return '已完成';
    case 'FAILED':
      return '失败';
    case 'CANCELLED':
      return '已取消';
    default:
      return status;
  }
}

export function metricFlagLabel(flag: string): string {
  switch (flag) {
    case 'HIGH':
      return '偏高';
    case 'LOW':
      return '偏低';
    case 'ABNORMAL':
      return '异常';
    default:
      return '正常';
  }
}

export function formatReportDate(value?: Date | string | null): string {
  if (!value) return '未知日期';
  return new Date(value).toLocaleDateString();
}
