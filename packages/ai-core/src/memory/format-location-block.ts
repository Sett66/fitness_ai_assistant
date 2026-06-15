import type { LocationContext } from '@fitness/shared';

function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 将移动端附带的定位注入 Agent system prompt；无定位时返回空字符串 */
export function formatLocationContextBlock(location?: LocationContext): string {
  if (!location) {
    return '';
  }

  const parts = [`纬度 ${roundCoord(location.lat)}`, `经度 ${roundCoord(location.lng)}`];
  if (location.city) {
    parts.push(`城市 ${location.city}`);
  }

  return [
    '【用户当前位置】',
    parts.join('，'),
    '用户问天气、附近、周围健身房时，请直接用上述坐标调用 get_weather 或 search_nearby_gyms。',
    '勿向用户复述精确坐标；无坐标时再 geocode_place 或追问城市。',
  ].join('\n');
}
