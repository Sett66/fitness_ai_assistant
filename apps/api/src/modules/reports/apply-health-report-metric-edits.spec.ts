import { applyHealthReportMetricEdits, getAiTaskDailyLimit } from '@fitness/shared';

describe('REPORT-04 metric edits + quota', () => {
  it('REPORT_REASSESS daily limit is 10 and independent of REPORT_ANALYZE', () => {
    expect(getAiTaskDailyLimit('REPORT_REASSESS')).toBe(10);
    expect(getAiTaskDailyLimit('REPORT_ANALYZE')).toBe(3);
  });

  it('rejects catalog-outside keys and marks claimed items as edited', () => {
    const rejected = applyHealthReportMetricEdits(
      { items: [], otherItems: [{ nameZh: '神秘指标', value: 1, unit: '', flag: 'NORMAL' }] },
      {
        items: [{ key: 'FAKE_KEY', nameZh: '捏造', value: 1, unit: '', flag: 'NORMAL' }],
        otherItems: [],
      },
    );
    expect(rejected.ok).toBe(false);

    const claimed = applyHealthReportMetricEdits(
      {
        items: [{ key: 'HDL', nameZh: '高密度脂蛋白', value: 1.2, unit: 'mmol/L', flag: 'NORMAL' }],
        otherItems: [{ nameZh: '低密度', value: 3.5, unit: 'mmol/L', flag: 'HIGH' }],
      },
      {
        items: [
          { key: 'HDL', nameZh: '高密度脂蛋白', value: 1.2, unit: 'mmol/L', flag: 'NORMAL' },
          { key: 'LDL', nameZh: '低密度脂蛋白', value: 3.5, unit: 'mmol/L', flag: 'HIGH' },
        ],
        otherItems: [],
      },
    );
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    const ldl = claimed.metrics.items.find((item) => item.key === 'LDL');
    const hdl = claimed.metrics.items.find((item) => item.key === 'HDL');
    expect(ldl?.edited).toBe(true);
    expect(hdl?.edited).toBeUndefined();
  });
});
