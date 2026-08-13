import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { normalizeReportMetrics } from './normalize-report-metrics';

describe('normalizeReportMetrics', () => {
  it('promotes blood routine otherItems into catalog items', () => {
    const result = normalizeReportMetrics({
      items: [
        {
          key: 'HGB',
          nameZh: '血红蛋白',
          value: 134,
          unit: 'g/L',
          flag: 'NORMAL',
        },
      ],
      otherItems: [
        { nameZh: '白细胞', value: 5.25, unit: '10^9/L', flag: 'NORMAL' },
        { nameZh: '血小板', value: 254, unit: '10^9/L', flag: 'NORMAL' },
      ],
    });

    assert.deepEqual(result.items.map((item) => item.key).sort(), ['HGB', 'PLT', 'WBC']);
    assert.equal(result.otherItems.length, 0);
  });

  it('demotes mismatched RHR with blood count unit', () => {
    const result = normalizeReportMetrics({
      items: [
        {
          key: 'RHR',
          nameZh: '静息心率',
          value: 5.25,
          unit: '10^9/L',
          flag: 'NORMAL',
        },
      ],
      otherItems: [],
    });

    assert.equal(result.items.length, 0);
    assert.equal(result.otherItems[0]?.nameZh, '静息心率');
    assert.equal(result.otherItems[0]?.value, 5.25);
  });

  it('prefers nameZh mapping over wrong model key', () => {
    const result = normalizeReportMetrics({
      items: [
        {
          key: 'RHR',
          nameZh: '白细胞',
          value: 5.25,
          unit: '10^9/L',
          flag: 'NORMAL',
        },
      ],
      otherItems: [],
    });

    assert.equal(result.items.length, 1);
    assert.equal(result.items[0]?.key, 'WBC');
    assert.equal(result.items[0]?.nameZh, '白细胞');
  });

  it('remaps urine glucose mislabeled as FPG', () => {
    const result = normalizeReportMetrics({
      items: [
        {
          key: 'FPG',
          nameZh: '葡萄糖',
          value: '-',
          unit: 'mmol/L',
          flag: 'NORMAL',
        },
      ],
      otherItems: [
        { nameZh: '蛋白质', value: '++', unit: 'g/l', flag: 'HIGH' },
        { nameZh: '丙氨酸氨基转移酶', value: 16, unit: 'U/L', flag: 'NORMAL' },
      ],
    });

    assert.equal(
      result.items.find((item) => item.key === 'FPG'),
      undefined,
    );
    assert.equal(result.items.find((item) => item.key === 'URINE_GLU')?.value, '-');
    assert.equal(result.items.find((item) => item.key === 'URINE_PROTEIN')?.value, '++');
    assert.equal(result.items.find((item) => item.key === 'ALT')?.value, 16);
  });

  it('promotes remaining urine microscopy items from otherItems', () => {
    const result = normalizeReportMetrics({
      items: [],
      otherItems: [
        { nameZh: '颜色', value: '浅黄', unit: '', flag: 'NORMAL' },
        { nameZh: '浊度', value: '清晰', unit: '', flag: 'NORMAL' },
        { nameZh: '结晶(镜检)', value: '阴性', unit: 'HP', flag: 'NORMAL' },
        { nameZh: '管型(镜检)', value: '阴性', unit: 'LP', flag: 'NORMAL' },
        { nameZh: '鳞状上皮细胞(镜检)', value: '少见', unit: 'HP', flag: 'NORMAL' },
      ],
    });

    assert.deepEqual(result.items.map((item) => item.key).sort(), [
      'URINE_CASTS',
      'URINE_COLOR',
      'URINE_CRYSTALS',
      'URINE_SQUAMOUS_EPI',
      'URINE_TURBIDITY',
    ]);
    assert.equal(result.otherItems.length, 0);
  });
});
