import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { collectCriticalHits } from './collect-critical-hits';

describe('collectCriticalHits', () => {
  it('flags catalog criticalHigh hits and ignores qualitative values', () => {
    const hits = collectCriticalHits({
      items: [
        { key: 'FPG', nameZh: '空腹血糖', value: 23.1, unit: 'mmol/L', flag: 'HIGH' },
        { key: 'SBP', nameZh: '收缩压', value: 120, unit: 'mmHg', flag: 'NORMAL' },
        { key: 'URINE_PROTEIN', nameZh: '尿蛋白', value: '++', unit: '', flag: 'HIGH' },
      ],
      otherItems: [],
    });

    assert.deepEqual(hits, ['FPG']);
  });

  it('flags criticalLow hits such as eGFR', () => {
    const hits = collectCriticalHits({
      items: [
        {
          key: 'EGFR',
          nameZh: '估算肾小球滤过率',
          value: 12,
          unit: 'mL/min/1.73m2',
          flag: 'LOW',
        },
      ],
      otherItems: [],
    });

    assert.deepEqual(hits, ['EGFR']);
  });
});
