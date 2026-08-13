import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { HealthReportMetricsSchema } from '../schemas/health-report';
import { sanitizeReportMetricsJson } from './sanitize-report-metrics-json';

describe('sanitizeReportMetricsJson', () => {
  it('parses string refLow/refHigh and preserves qualitative refText', () => {
    const raw = {
      items: [
        {
          key: 'SBP',
          nameZh: '收缩压',
          value: 120,
          unit: 'mmHg',
          refLow: '130',
          refHigh: '175',
          flag: 'NORMAL',
        },
        {
          key: 'URINE_PROTEIN',
          nameZh: '尿蛋白',
          value: '-',
          unit: '',
          refLow: '阴性',
          flag: 'NORMAL',
        },
      ],
      otherItems: [],
    };

    const sanitized = sanitizeReportMetricsJson(raw);
    const parsed = HealthReportMetricsSchema.parse(sanitized);

    assert.equal(parsed.items[0]?.refLow, 130);
    assert.equal(parsed.items[0]?.refHigh, 175);
    assert.equal(parsed.items[0]?.refText, undefined);
    assert.equal(parsed.items[1]?.refLow, undefined);
    assert.equal(parsed.items[1]?.refText, '阴性');
  });

  it('parses combined range strings like 130--175', () => {
    const raw = {
      items: [
        {
          key: 'HGB',
          nameZh: '血红蛋白',
          value: 134,
          unit: 'g/L',
          refRange: '130--175',
          flag: 'NORMAL',
        },
      ],
      otherItems: [],
    };

    const sanitized = sanitizeReportMetricsJson(raw) as {
      items: Array<Record<string, unknown>>;
    };
    assert.equal(sanitized.items[0]?.refLow, 130);
    assert.equal(sanitized.items[0]?.refHigh, 175);
    assert.equal(sanitized.items[0]?.refRange, undefined);
  });

  it('accepts otherItems with string references', () => {
    const raw = {
      items: [],
      otherItems: [
        {
          nameZh: '结晶(镜检)',
          value: '阴性',
          unit: 'HP',
          refLow: '阴性',
          flag: 'NORMAL',
        },
      ],
    };

    const parsed = HealthReportMetricsSchema.parse(sanitizeReportMetricsJson(raw));
    assert.equal(parsed.otherItems[0]?.refText, '阴性');
  });
});
