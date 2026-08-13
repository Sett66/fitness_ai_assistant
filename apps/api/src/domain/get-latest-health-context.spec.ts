import { buildCoachSystemPrompt, formatHealthContextBlock } from '@fitness/ai-core';
import { HEALTH_CONTEXT_FRESHNESS_MONTHS, pickLatestHealthContext } from '@fitness/shared';

const NOW = new Date('2026-08-13T00:00:00.000Z');

function monthsAgo(months: number): Date {
  return new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - months, NOW.getUTCDate()));
}

describe('getLatestHealthContext freshness window', () => {
  it(`hits at ${HEALTH_CONTEXT_FRESHNESS_MONTHS - 1} months and misses at ${HEALTH_CONTEXT_FRESHNESS_MONTHS + 1} months`, () => {
    const hit = pickLatestHealthContext(
      [
        {
          healthContext: '【健康约束】尿酸偏高，控制高嘌呤。',
          reportDate: monthsAgo(11),
          createdAt: monthsAgo(11),
        },
      ],
      NOW,
    );
    expect(hit).toContain('尿酸偏高');

    const miss = pickLatestHealthContext(
      [
        {
          healthContext: '【健康约束】尿酸偏高，控制高嘌呤。',
          reportDate: monthsAgo(13),
          createdAt: monthsAgo(13),
        },
      ],
      NOW,
    );
    expect(miss).toBeNull();
  });

  it('picks the latest DONE report within the window among multiple', () => {
    const picked = pickLatestHealthContext(
      [
        {
          healthContext: '旧报告：血脂偏高',
          reportDate: monthsAgo(6),
          createdAt: monthsAgo(6),
        },
        {
          healthContext: '新报告：空腹血糖偏高',
          reportDate: monthsAgo(1),
          createdAt: monthsAgo(1),
        },
        {
          healthContext: '超窗报告：不该注入',
          reportDate: monthsAgo(13),
          createdAt: monthsAgo(13),
        },
      ],
      NOW,
    );
    expect(picked).toBe('新报告：空腹血糖偏高');
  });

  it('falls back to createdAt when reportDate is missing', () => {
    const hit = pickLatestHealthContext(
      [{ healthContext: '无报告日期但仍新鲜', reportDate: null, createdAt: monthsAgo(11) }],
      NOW,
    );
    expect(hit).toBe('无报告日期但仍新鲜');

    const miss = pickLatestHealthContext(
      [{ healthContext: '无报告日期且超窗', reportDate: null, createdAt: monthsAgo(13) }],
      NOW,
    );
    expect(miss).toBeNull();
  });

  it('skips empty healthContext', () => {
    const picked = pickLatestHealthContext(
      [
        { healthContext: '   ', reportDate: monthsAgo(1), createdAt: monthsAgo(1) },
        { healthContext: null, reportDate: monthsAgo(2), createdAt: monthsAgo(2) },
      ],
      NOW,
    );
    expect(picked).toBeNull();
  });
});

describe('Coach healthContext prompt injection', () => {
  const emptyUserContext = {
    profile: null,
    strengthLevels: [],
  };

  it('omits 【体检概况】 when healthContext is absent', () => {
    expect(formatHealthContextBlock(undefined)).toBe('');
    expect(formatHealthContextBlock('  ')).toBe('');

    const prompt = buildCoachSystemPrompt({
      userContext: emptyUserContext,
      mode: 'stream',
    });
    expect(prompt).not.toContain('【体检概况】');
  });

  it('injects 【体检概况】 for both stream and agent paths', () => {
    const userContext = {
      ...emptyUserContext,
      healthContext: '【健康约束】\n- 血脂偏高：有氧中低强度为主。',
    };

    const streamPrompt = buildCoachSystemPrompt({ userContext, mode: 'stream' });
    const agentPrompt = buildCoachSystemPrompt({ userContext, mode: 'agent' });

    expect(streamPrompt).toContain('【体检概况】');
    expect(streamPrompt).toContain('血脂偏高');
    expect(agentPrompt).toContain('【体检概况】');
    expect(agentPrompt).toContain('血脂偏高');
  });
});
