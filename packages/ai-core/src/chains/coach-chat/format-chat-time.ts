const WEEKDAY_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;
const DEFAULT_TZ_OFFSET_MINUTES = 480;
const MS_PER_DAY = 86_400_000;

export function resolveTimezoneOffsetMinutes(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < -720 || value > 840) {
    return DEFAULT_TZ_OFFSET_MINUTES;
  }
  return value;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toValidDate(value: Date | string | undefined | null): Date | undefined {
  if (value == null) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function shiftToLocal(at: Date, timezoneOffsetMinutes: number): Date {
  return new Date(at.getTime() + timezoneOffsetMinutes * 60_000);
}

function localDayUtcMs(at: Date, timezoneOffsetMinutes: number): number {
  const local = shiftToLocal(at, timezoneOffsetMinutes);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
}

export function formatTimezoneLabel(timezoneOffsetMinutes: number): string {
  const tz = resolveTimezoneOffsetMinutes(timezoneOffsetMinutes);
  const sign = tz >= 0 ? '+' : '-';
  const absMin = Math.abs(tz);
  const hours = String(Math.trunc(absMin / 60)).padStart(2, '0');
  const minutes = String(absMin % 60).padStart(2, '0');
  return minutes === '00' ? `UTC${sign}${Number(hours)}` : `UTC${sign}${hours}:${minutes}`;
}

/** `2026-08-17 周一 20:15（UTC+8）` */
export function formatLocalDateTimeLabel(at: Date, timezoneOffsetMinutes: number): string {
  const tz = resolveTimezoneOffsetMinutes(timezoneOffsetMinutes);
  const local = shiftToLocal(at, tz);
  const weekday = WEEKDAY_ZH[local.getUTCDay()] ?? '';
  const date = `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())}`;
  const time = `${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`;
  return `${date} ${weekday} ${time}（${formatTimezoneLabel(tz)}）`;
}

/** 与 get_current_datetime 工具返回保持同一句式 */
export function formatCurrentDatetimeLine(at: Date, timezoneOffsetMinutes: number): string {
  return `当前日期时间：${formatLocalDateTimeLabel(at, timezoneOffsetMinutes)}`;
}

export function formatCurrentDatetimeBlock(at: Date, timezoneOffsetMinutes: number): string {
  return ['【当前时间】', formatLocalDateTimeLabel(at, timezoneOffsetMinutes)].join('\n');
}

/** 同一天用「今天/昨天」，更早用日历日期，便于模型对比「现在」 */
export function formatHistoryTimestamp(
  createdAt: Date,
  now: Date,
  timezoneOffsetMinutes: number,
): string {
  const tz = resolveTimezoneOffsetMinutes(timezoneOffsetMinutes);
  const local = shiftToLocal(createdAt, tz);
  const time = `${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`;
  const dayDiff = (localDayUtcMs(now, tz) - localDayUtcMs(createdAt, tz)) / MS_PER_DAY;

  if (dayDiff === 0) {
    return `今天 ${time}`;
  }
  if (dayDiff === 1) {
    return `昨天 ${time}`;
  }
  return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())} ${time}`;
}

export function stampCoachMessageContent(
  content: string,
  createdAt: Date | string | undefined | null,
  now: Date,
  timezoneOffsetMinutes: number,
): string {
  const at = toValidDate(createdAt);
  if (!at) {
    return content;
  }
  return `[${formatHistoryTimestamp(at, now, timezoneOffsetMinutes)}] ${content}`;
}
