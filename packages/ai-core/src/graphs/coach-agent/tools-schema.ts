import { COACH_TOOL_PROGRESS_LABELS_ZH } from '@fitness/shared';
import type { CoachToolName } from '@fitness/shared';

import type { ToolDefinition } from '../../llm/tool-types';

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
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description:
        '查询指定位置的天气：返回当前天气以及未来数日（含今日）的逐日预报（每日最高/最低气温、降水概率、风力），并给出户外训练建议。用户问出门训练、户外跑步、今天/明天/后天/周末/未来几天天气时应优先调用。有定位时可直接调用；否则需传入 city 或先追问用户城市。返回结果里每天都带日期与星期，请据此回答「明天/周末」等相对日期。',
      parameters: {
        type: 'object',
        properties: {
          lat: { type: 'number', description: '纬度（WGS84）' },
          lng: { type: 'number', description: '经度（WGS84）' },
          city: { type: 'string', description: '城市名，无坐标时使用，如「上海」' },
          days: {
            type: 'number',
            description:
              '需要的预报天数（含今日），默认 3，最大 7。问「明天」传 2，问「未来一周」传 7。',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_datetime',
      description:
        '获取当前日期、星期与时间（基于用户所在时区）。当用户问题涉及「今天/明天/几号/星期几/现在几点」等日期时间，或需要把「明天/周末」换算成具体日期（例如配合天气预报）时调用。',
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'geocode_place',
      description:
        '将城市或地址文本解析为坐标与城市名。出差、陌生城市、需要先确定位置再搜周边时调用，如「上海」「杭州市西湖区」。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '地点文本，如「上海市」「北京朝阳区」' },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_nearby_gyms',
      description:
        '根据坐标搜索周边健身房 POI 列表（名称、地址、距离）。需先有 lat/lng，可先调用 geocode_place。用户问出差地、陌生城市附近健身房时使用。',
      parameters: {
        type: 'object',
        properties: {
          lat: { type: 'number', description: '纬度' },
          lng: { type: 'number', description: '经度' },
          radiusM: {
            type: 'number',
            description: '搜索半径（米），默认 3000，最大 5000',
          },
        },
        required: ['lat', 'lng'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'enqueue_plan_generate',
      description:
        '提交训练或饮食计划生成任务（异步 Worker 处理，对话中会出现进度卡片）。用户明确要求生成多周训练/饮食计划时必须调用，不要在正文手写完整周计划表。',
      parameters: {
        type: 'object',
        properties: {
          planType: {
            type: 'string',
            enum: ['WORKOUT', 'MEAL'],
            description: '计划类型：WORKOUT 训练计划，MEAL 饮食计划',
          },
          mesocycleWeeks: {
            type: 'number',
            description: '周期周数，默认 4',
          },
          notes: {
            type: 'string',
            description: '用户补充说明或偏好（可选）',
          },
          preferences: {
            type: 'object',
            description: '仅 WORKOUT 时有效：splitType、daysPerWeek、includeCardio',
            properties: {
              splitType: { type: 'string' },
              daysPerWeek: { type: 'number' },
              includeCardio: { type: 'boolean' },
            },
            additionalProperties: false,
          },
        },
        required: ['planType'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'enqueue_meal_vision',
      description:
        '提交餐照识别任务（需 imageObjectKey）。Agent 对话通常无附件；无图时勿调用，应引导用户使用 App 附件菜单上传餐照。',
      parameters: {
        type: 'object',
        properties: {
          imageObjectKey: {
            type: 'string',
            description: '已上传餐照的 objectKey（通常由 App 附件提供）',
          },
          mealType: {
            type: 'string',
            enum: ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'],
            description: '餐次类型（可选）',
          },
          saveMealLog: {
            type: 'boolean',
            description: '是否直接写入饮食记录，默认 false',
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

export const COACH_TOOL_LABELS: Partial<Record<CoachToolName, string>> =
  COACH_TOOL_PROGRESS_LABELS_ZH;
