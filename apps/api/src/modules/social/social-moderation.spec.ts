import { runSocialModerate } from '@fitness/ai-core';
import { AI_TASK_DAILY_LIMITS, findBannedKeyword, getAiTaskDailyLimit } from '@fitness/shared';

describe('findBannedKeyword', () => {
  it('命中返回词表中的词，不区分大小写', () => {
    expect(findBannedKeyword('please buy this bannedword today')).toBe('bannedword');
    expect(findBannedKeyword('BANNEDWORD')).toBe('bannedword');
  });

  it('归一化后能拦住空白与常见分隔符绕过', () => {
    expect(findBannedKeyword('Banned Word')).toBe('bannedword');
    expect(findBannedKeyword('banned_word')).toBe('bannedword');
    expect(findBannedKeyword('banned-word')).toBe('bannedword');
    expect(findBannedKeyword('加 微 信 号')).toBe('加微信号');
    expect(findBannedKeyword('加_微_信_号')).toBe('加微信号');
  });

  it('健身相关内容不误拦', () => {
    expect(findBannedKeyword('今天深蹲 100kg')).toBeNull();
    expect(findBannedKeyword('我在做 500 kcal 极低热量减脂')).toBeNull();
  });
});

describe('SOCIAL_MODERATE 配额', () => {
  it('不登记进 AI_TASK_DAILY_LIMITS，回落到默认上限也不会被发帖路径调用', () => {
    expect(AI_TASK_DAILY_LIMITS.SOCIAL_MODERATE).toBeUndefined();
    expect(getAiTaskDailyLimit('SOCIAL_MODERATE')).toBe(5);
  });
});

describe('runSocialModerate', () => {
  it('解析 APPROVED 并截断过长的 REJECTED reason', async () => {
    const approved = await runSocialModerate(
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
    expect(approved.result.decision).toBe('APPROVED');
    expect(approved.result.reason).toBe('');

    const rejected = await runSocialModerate(
      { body: 'spam' },
      {
        client: {
          generateJson: async () => ({
            text: JSON.stringify({ decision: 'rejected', reason: '违规'.repeat(80) }),
            usage: { tokenIn: 8, tokenOut: 20, costCny: 0 },
          }),
        },
      },
    );
    expect(rejected.result.decision).toBe('REJECTED');
    expect(rejected.result.reason.length).toBe(100);
  });
});
