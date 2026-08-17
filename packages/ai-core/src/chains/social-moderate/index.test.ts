import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { SOCIAL_MODERATE_PROMPT } from '../../prompts/social-moderate';
import { runSocialModerate } from '.';

describe('runSocialModerate', () => {
  it('parses APPROVED with empty reason', async () => {
    const output = await runSocialModerate(
      { body: '今天深蹲 100kg' },
      {
        client: {
          generateJson: async () => ({
            text: JSON.stringify({ decision: 'APPROVED', reason: '' }),
            usage: { tokenIn: 8, tokenOut: 4, costCny: 0 },
          }),
        },
      },
    );

    assert.equal(output.result.decision, 'APPROVED');
    assert.equal(output.result.reason, '');
  });

  it('truncates a long REJECTED reason to 100 chars', async () => {
    const output = await runSocialModerate(
      { body: 'some spam' },
      {
        client: {
          generateJson: async () => ({
            text: JSON.stringify({ decision: 'rejected', reason: '违规'.repeat(80) }),
            usage: { tokenIn: 8, tokenOut: 20, costCny: 0 },
          }),
        },
      },
    );

    assert.equal(output.result.decision, 'REJECTED');
    assert.equal(output.result.reason.length, 100);
  });

  it('prompt lets fitness controversy through and only flags five violation classes', () => {
    assert.match(SOCIAL_MODERATE_PROMPT, /激进饮食法/);
    assert.match(SOCIAL_MODERATE_PROMPT, /非处方补剂/);
    assert.match(SOCIAL_MODERATE_PROMPT, /色情/);
    assert.match(SOCIAL_MODERATE_PROMPT, /暴力/);
    assert.match(SOCIAL_MODERATE_PROMPT, /政治敏感/);
    assert.match(SOCIAL_MODERATE_PROMPT, /广告引流/);
    assert.match(SOCIAL_MODERATE_PROMPT, /人身攻击/);
    assert.match(SOCIAL_MODERATE_PROMPT, /拿不准时选择 APPROVED/);
  });
});
