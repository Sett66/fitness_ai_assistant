import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { runReportExtract } from '.';

describe('runReportExtract', () => {
  it('parses catalog items and long-tail otherItems', async () => {
    const output = await runReportExtract(
      {
        imageUrls: ['data:image/png;base64,abc'],
        catalog: [{ key: 'LDL', nameZh: '低密度脂蛋白胆固醇', aliases: ['LDL-C'], unit: 'mmol/L' }],
      },
      {
        client: {
          generateJson: async () => ({
            text: JSON.stringify({
              reportDate: '2026-08-05T00:00:00.000Z',
              items: [
                {
                  key: 'LDL',
                  nameZh: '低密度脂蛋白胆固醇',
                  value: 3.8,
                  unit: 'mmol/L',
                  refHigh: 3.4,
                  flag: 'HIGH',
                },
              ],
              otherItems: [{ nameZh: '白细胞', value: 5.2, unit: '10^9/L', flag: 'NORMAL' }],
            }),
            usage: { tokenIn: 10, tokenOut: 20, costCny: 0.01 },
          }),
        },
      },
    );

    assert.equal(output.result.items[0]?.key, 'LDL');
    assert.equal(
      output.result.items.some((item) => item.key === 'WBC'),
      true,
    );
    assert.equal(output.result.otherItems.length, 0);
  });

  it('preserves string reference ranges before Zod validation', async () => {
    const output = await runReportExtract(
      {
        imageUrls: ['data:image/png;base64,abc'],
        catalog: [{ key: 'SBP', nameZh: '收缩压', aliases: ['SBP'], unit: 'mmHg' }],
      },
      {
        client: {
          generateJson: async () => ({
            text: JSON.stringify({
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
            }),
            usage: { tokenIn: 10, tokenOut: 20, costCny: 0.01 },
          }),
        },
      },
    );

    assert.equal(output.result.items.find((item) => item.key === 'SBP')?.refLow, 130);
    assert.equal(output.result.items.find((item) => item.key === 'SBP')?.refHigh, 175);
    assert.equal(output.result.items.find((item) => item.key === 'URINE_PROTEIN')?.refText, '阴性');
  });

  it('normalizes hallucinated RHR with blood count unit into otherItems', async () => {
    const output = await runReportExtract(
      {
        imageUrls: ['data:image/png;base64,abc'],
        catalog: [{ key: 'RHR', nameZh: '静息心率', aliases: ['RHR'], unit: 'bpm' }],
      },
      {
        client: {
          generateJson: async () => ({
            text: JSON.stringify({
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
            }),
            usage: { tokenIn: 10, tokenOut: 20, costCny: 0.01 },
          }),
        },
      },
    );

    assert.equal(output.result.items.length, 0);
    assert.equal(output.result.otherItems[0]?.nameZh, '静息心率');
  });
});
