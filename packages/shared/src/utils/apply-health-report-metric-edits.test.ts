import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { applyHealthReportMetricEdits } from './apply-health-report-metric-edits';
import type { HealthReportMetrics } from '../schemas/health-report';

const existing: HealthReportMetrics = {
  items: [
    {
      key: 'FPG',
      nameZh: '空腹血糖',
      value: 6.8,
      unit: 'mmol/L',
      flag: 'HIGH',
    },
    {
      key: 'HDL',
      nameZh: '高密度脂蛋白',
      value: 1.2,
      unit: 'mmol/L',
      flag: 'NORMAL',
    },
  ],
  otherItems: [
    {
      nameZh: '神秘指标',
      value: 42,
      unit: 'U/L',
      flag: 'ABNORMAL',
    },
  ],
  summaryText: '摘要保留',
};

describe('applyHealthReportMetricEdits', () => {
  it('rejects keys outside the catalog', () => {
    const result = applyHealthReportMetricEdits(existing, {
      items: [
        {
          key: 'NOT_A_REAL_METRIC',
          nameZh: '捏造',
          value: 1,
          unit: '',
          flag: 'NORMAL',
        },
      ],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'INVALID_KEY');
      assert.deepEqual(result.error.keys, ['NOT_A_REAL_METRIC']);
    }
  });

  it('rejects duplicate catalog keys', () => {
    const result = applyHealthReportMetricEdits(existing, {
      items: [
        { key: 'FPG', nameZh: '空腹血糖', value: 5, unit: 'mmol/L', flag: 'NORMAL' },
        { key: 'FPG', nameZh: '空腹血糖', value: 6, unit: 'mmol/L', flag: 'HIGH' },
      ],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, 'DUPLICATE_KEY');
    }
  });

  it('marks changed and newly claimed items as edited, keeps unchanged flags', () => {
    const result = applyHealthReportMetricEdits(existing, {
      items: [
        { key: 'FPG', nameZh: '空腹血糖', value: 5.1, unit: 'mmol/L', flag: 'NORMAL' },
        { key: 'HDL', nameZh: '高密度脂蛋白', value: 1.2, unit: 'mmol/L', flag: 'NORMAL' },
        { key: 'LDL', nameZh: '低密度脂蛋白', value: 42, unit: 'U/L', flag: 'ABNORMAL' },
      ],
      otherItems: [],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const byKey = new Map(result.metrics.items.map((item) => [item.key, item]));
    assert.equal(byKey.get('FPG')?.edited, true);
    assert.equal(byKey.get('HDL')?.edited, undefined);
    assert.equal(byKey.get('LDL')?.edited, true);
    assert.deepEqual(result.metrics.otherItems, []);
    assert.equal(result.metrics.summaryText, '摘要保留');
  });

  it('preserves an already-edited flag even if the payload is unchanged', () => {
    const result = applyHealthReportMetricEdits(
      {
        items: [
          {
            key: 'FPG',
            nameZh: '空腹血糖',
            value: 5.1,
            unit: 'mmol/L',
            flag: 'NORMAL',
            edited: true,
          },
        ],
        otherItems: [],
      },
      {
        items: [{ key: 'FPG', nameZh: '空腹血糖', value: 5.1, unit: 'mmol/L', flag: 'NORMAL' }],
      },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.metrics.items[0]?.edited, true);
  });
});
