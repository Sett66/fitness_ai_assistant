import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { REPORT_ASSESS_PROMPT } from '../../prompts/report-assess';
import { runReportAssess } from '.';

describe('runReportAssess', () => {
  it('parses assessment JSON and forces URGENT for criticalHits', async () => {
    const output = await runReportAssess(
      {
        metrics: {
          items: [{ key: 'FPG', nameZh: '空腹血糖', value: 23.1, unit: 'mmol/L', flag: 'HIGH' }],
          otherItems: [],
        },
        profile: { gender: 'MALE', goal: 'FAT_LOSS', heightCm: 178, weightKg: 80 },
        criticalHits: ['FPG'],
      },
      {
        client: {
          generateJson: async () => ({
            text: JSON.stringify({
              riskAssessment: {
                overallSummary: '空腹血糖明显高于参考范围，训练强度需要下调。',
                findings: [
                  {
                    metricKey: 'FPG',
                    title: '空腹血糖',
                    detail: '偏离参考范围，建议降低高强度训练占比并注意补水。',
                    severity: 'ATTENTION',
                  },
                ],
                seeDoctorAdvised: false,
              },
              healthContext: '【健康约束】\n- 空腹血糖偏高：训练前避免力竭，注意补水。',
            }),
            usage: { tokenIn: 20, tokenOut: 40, costCny: 0.02 },
          }),
        },
      },
    );

    assert.equal(output.result.riskAssessment.seeDoctorAdvised, true);
    assert.equal(output.result.riskAssessment.findings[0]?.severity, 'URGENT');
    assert.match(output.result.riskAssessment.findings[0]?.detail ?? '', /建议尽快就医/);
    assert.ok(output.result.healthContext.length > 0);
    assert.doesNotMatch(output.result.riskAssessment.overallSummary, /确诊|处方|用药|治疗方案/);
  });

  it('prompt hard-constraints forbid diagnosis and prescriptions', () => {
    assert.match(REPORT_ASSESS_PROMPT, /非医疗诊断/);
    assert.match(REPORT_ASSESS_PROMPT, /禁止/);
    assert.match(REPORT_ASSESS_PROMPT, /开药/);
    assert.match(REPORT_ASSESS_PROMPT, /治疗方案/);
    assert.match(REPORT_ASSESS_PROMPT, /建议尽快就医/);
  });
});
