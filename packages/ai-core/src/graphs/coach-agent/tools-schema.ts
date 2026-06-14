import type { CoachToolName } from '@fitness/shared';

import type { ToolDefinition } from '../../llm/tool-types';

/** 本 Issue 仅注册 get_user_fitness_snapshot；后续 Issue 追加至数组 */
export const COACH_AGENT_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_user_fitness_snapshot',
      description:
        '获取用户健身档案、今日营养摄入与剩余配额、活跃训练/饮食计划摘要。回答饮食、训练进度、今日还能吃多少等问题前应优先调用。',
      parameters: {
        type: 'object',
        properties: {
          timezoneOffsetMinutes: {
            type: 'number',
            description: '用户时区相对 UTC 的偏移分钟数，例如东八区为 480',
          },
        },
        additionalProperties: false,
      },
    },
  },
];

export const COACH_AGENT_TOOL_NAMES = COACH_AGENT_TOOL_DEFINITIONS.map(
  (tool) => tool.function.name as CoachToolName,
);

export const COACH_TOOL_LABELS: Partial<Record<CoachToolName, string>> = {
  get_user_fitness_snapshot: '正在读取你的健身数据…',
  get_weather: '正在查询天气…',
  geocode_place: '正在解析地点…',
  search_nearby_gyms: '正在搜索附近健身房…',
  enqueue_plan_generate: '正在创建计划任务…',
  enqueue_meal_vision: '正在创建识图任务…',
};
