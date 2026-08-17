import {
  buildCoachSystemPrompt,
  formatCurrentDatetimeBlock,
  formatCurrentDatetimeLine,
  formatHistoryTimestamp,
  stampCoachMessageContent,
} from '@fitness/ai-core';

/** 2026-08-17 周一：UTC 12:15 = 东八区 20:15 */
const EVENING = new Date('2026-08-17T12:15:00.000Z');
const TZ = 480;

const emptyUserContext = {
  profile: null,
  strengthLevels: [],
};

describe('coach chat time awareness', () => {
  it('stamps same-day morning history as 今天 when now is evening', () => {
    const morning = new Date('2026-08-17T01:12:00.000Z');
    expect(formatHistoryTimestamp(morning, EVENING, TZ)).toBe('今天 09:12');
    expect(stampCoachMessageContent('今天下午天气怎么样适合跑步吗？', morning, EVENING, TZ)).toBe(
      '[今天 09:12] 今天下午天气怎么样适合跑步吗？',
    );
  });

  it('stamps yesterday and older calendar dates', () => {
    const yesterday = new Date('2026-08-16T13:30:00.000Z');
    const older = new Date('2026-08-15T10:00:00.000Z');
    expect(formatHistoryTimestamp(yesterday, EVENING, TZ)).toBe('昨天 21:30');
    expect(formatHistoryTimestamp(older, EVENING, TZ)).toBe('2026-08-15 18:00');
  });

  it('leaves content unchanged when createdAt is missing', () => {
    expect(stampCoachMessageContent('你好', undefined, EVENING, TZ)).toBe('你好');
  });

  it('formats current datetime for system prompt and the datetime tool', () => {
    expect(formatCurrentDatetimeBlock(EVENING, TZ)).toBe(
      ['【当前时间】', '2026-08-17 周一 20:15（UTC+8）'].join('\n'),
    );
    expect(formatCurrentDatetimeLine(EVENING, TZ)).toBe(
      '当前日期时间：2026-08-17 周一 20:15（UTC+8）',
    );
    expect(formatCurrentDatetimeLine(EVENING, 330)).toBe(
      '当前日期时间：2026-08-17 周一 17:45（UTC+05:30）',
    );
  });

  it('injects current time and time-awareness rules into stream and agent prompts', () => {
    const streamPrompt = buildCoachSystemPrompt({
      userContext: emptyUserContext,
      mode: 'stream',
      timezoneOffsetMinutes: TZ,
      now: EVENING,
    });
    const agentPrompt = buildCoachSystemPrompt({
      userContext: emptyUserContext,
      mode: 'agent',
      timezoneOffsetMinutes: TZ,
      now: EVENING,
    });

    for (const prompt of [streamPrompt, agentPrompt]) {
      expect(prompt).toContain('【当前时间】');
      expect(prompt).toContain('2026-08-17 周一 20:15（UTC+8）');
      expect(prompt).toContain('【时间意识】');
      expect(prompt).toContain('不要再追问那个已过期的安排');
    }
  });
});
