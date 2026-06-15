const LOCATION_HEURISTIC_PATTERNS = [
  /天气/,
  /出门/,
  /户外/,
  /附近/,
  /周围/,
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
 * 规则：仅当消息文本匹配 LBS/户外相关启发式关键字时附带。
 * opt-in 只表示用户曾同意权限弹窗，不应对每条消息都上报坐标。
 */
export function shouldAttachLocation(userText: string): boolean {
  const trimmed = userText.trim();
  if (!trimmed) return false;

  return LOCATION_HEURISTIC_PATTERNS.some((pattern) => pattern.test(trimmed));
}
