import { mmkv } from '../../storage/mmkv';

const OPT_IN_KEY = 'coachLocationOptIn';

const LOCATION_HEURISTIC_PATTERNS = [
  /天气/,
  /出门/,
  /户外/,
  /附近/,
  /出差/,
  /跑步/,
  /骑行/,
  /游泳/,
  /爬山/,
  /散步/,
  /健身房/,
  /拳馆/,
  /瑜伽馆/,
  /操课/,
  /户外运动/,
];

/**
 * 判断是否应在 CHAT 消息中附带 locationContext。
 *
 * 规则：用户已 opt-in 或 消息文本匹配启发式关键字。
 */
export function shouldAttachLocation(userText: string): boolean {
  const trimmed = userText.trim();
  if (!trimmed) return false;

  if (mmkv.getBoolean(OPT_IN_KEY)) return true;

  return LOCATION_HEURISTIC_PATTERNS.some((pattern) => pattern.test(trimmed));
}
