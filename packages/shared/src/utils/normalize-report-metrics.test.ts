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
});
