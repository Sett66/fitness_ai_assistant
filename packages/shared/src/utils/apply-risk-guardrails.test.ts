import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { applyRiskGuardrails } from './apply-risk-guardrails';

describe('applyRiskGuardrails', () => {
  it('upgrades critical hits to URGENT and sets seeDoctorAdvised', () => {
    const result = applyRiskGuardrails(
      {
        riskAssessment: {
          overallSummary: '空腹血糖明显偏高，训练前需谨慎。',
          findings: [
            {
              metricKey: 'FPG',
              title: '空腹血糖',
              detail: '数值明显高于参考范围，高强度训练前应降低负荷。',
              severity: 'ATTENTION',
            },
          ],
          seeDoctorAdvised: false,
        },
        healthContext: '空腹血糖偏高，训练注意补水与强度。',
      },
      ['FPG'],
    );

    assert.equal(result.riskAssessment.seeDoctorAdvised, true);
    assert.equal(result.riskAssessment.findings[0]?.severity, 'URGENT');
    assert.match(result.riskAssessment.findings[0]?.detail ?? '', /建议尽快就医/);
  });

  it('injects a finding when the model omitted a critical metric', () => {
    const result = applyRiskGuardrails(
      {
        riskAssessment: {
          overallSummary: '整体尚可。',
          findings: [],
          seeDoctorAdvised: false,
        },
        healthContext: '暂无特殊训练限制。',
      },
      ['CREATININE'],
    );

    assert.equal(result.riskAssessment.findings[0]?.metricKey, 'CREATININE');
    assert.equal(result.riskAssessment.findings[0]?.severity, 'URGENT');
    assert.equal(result.riskAssessment.seeDoctorAdvised, true);
  });
});
