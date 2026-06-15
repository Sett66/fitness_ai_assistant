import type { CoachToolName } from '../schemas/agent';

/** Coach Agent 工具日限（ADR 0008 §6，按用户自然日） */
export const COACH_TOOL_DAILY_LIMITS: Readonly<Partial<Record<CoachToolName, number>>> = {
  get_weather: 10,
  geocode_place: 20,
  search_nearby_gyms: 10,
  get_user_fitness_snapshot: 30,
};

export function getCoachToolDailyLimit(name: CoachToolName): number | undefined {
  return COACH_TOOL_DAILY_LIMITS[name];
}

/** 移动端 / SSE 展示用中文标签 */
export const COACH_TOOL_LABELS_ZH: Readonly<Partial<Record<CoachToolName, string>>> = {
  get_user_fitness_snapshot: '查询健身数据',
  get_weather: '查询天气',
  geocode_place: '解析地点',
  search_nearby_gyms: '搜索附近健身房',
  enqueue_plan_generate: '创建计划任务',
  enqueue_meal_vision: '创建识图任务',
};

/** 流式进行中状态文案（含「正在…」） */
export const COACH_TOOL_PROGRESS_LABELS_ZH: Readonly<Partial<Record<CoachToolName, string>>> = {
  get_user_fitness_snapshot: '正在读取你的健身数据…',
  get_weather: '正在查询天气…',
  geocode_place: '正在解析地点…',
  search_nearby_gyms: '正在搜索附近健身房…',
  enqueue_plan_generate: '正在创建计划任务…',
  enqueue_meal_vision: '正在创建识图任务…',
};
