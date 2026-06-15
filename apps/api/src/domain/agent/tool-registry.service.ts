import { Injectable } from '@nestjs/common';
import type { CoachToolName, LocationContext } from '@fitness/shared';
import {
  EnqueueMealVisionInputSchema,
  EnqueuePlanGenerateInputSchema,
  LLM_MODELS,
} from '@fitness/shared';

import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import { AmapClient } from '../../infra/geo/amap.client';
import { WeatherClient } from '../../infra/geo/weather.client';
import { AgentMemoryService } from '../agent-memory.service';
import { ConversationTaskService } from '../conversation-task.service';
import { UserContextService } from '../user-context.service';
import { ToolUsageService } from './tool-usage.service';

export type ToolContext = {
  userId: string;
  timezoneOffsetMinutes: number;
  locationContext?: LocationContext;
  conversationId?: string;
  triggerMessageId?: string;
  /** 当前 SSE 会话内已成功的工具调用次数 */
  sessionToolCounts?: Partial<Record<CoachToolName, number>>;
};

const TOOL_LIMIT_MESSAGE = '今日该工具次数已用完';
const WEATHER_NEED_LOCATION_MESSAGE = '需要城市名或定位权限';
const MEAL_VISION_NEED_IMAGE_MESSAGE = '请用户上传餐照（使用 App 附件菜单）';
const ENQUEUE_SUBMITTED_MESSAGE = '已提交生成，请在对话中查看进度';

@Injectable()
export class ToolRegistryService {
  constructor(
    private readonly userContext: UserContextService,
    private readonly agentMemory: AgentMemoryService,
    private readonly amap: AmapClient,
    private readonly weather: WeatherClient,
    private readonly toolUsage: ToolUsageService,
    private readonly conversationTask: ConversationTaskService,
  ) {}

  async execute(name: CoachToolName, input: unknown, ctx: ToolContext): Promise<unknown> {
    const limited = await this.checkDailyLimit(name, ctx);
    if (limited) {
      return limited;
    }

    switch (name) {
      case 'get_user_fitness_snapshot':
        return this.getUserFitnessSnapshot(input, ctx);
      case 'get_weather':
        return this.getWeather(input, ctx);
      case 'geocode_place':
        return this.geocodePlace(input, ctx);
      case 'search_nearby_gyms':
        return this.searchNearbyGyms(input, ctx);
      case 'enqueue_plan_generate':
        return this.enqueuePlanGenerate(input, ctx);
      case 'enqueue_meal_vision':
        return this.enqueueMealVision(input, ctx);
      default:
        throw new BizException('VALIDATION_FAILED', `未知工具：${name as string}`, 400);
    }
  }

  private async checkDailyLimit(
    name: CoachToolName,
    ctx: ToolContext,
  ): Promise<string | undefined> {
    if (!this.toolUsage.isLimitedTool(name)) {
      return undefined;
    }
    const sessionCount = ctx.sessionToolCounts?.[name] ?? 0;
    const exceeded = await this.toolUsage.isDailyLimitExceeded(
      ctx.userId,
      name,
      ctx.timezoneOffsetMinutes,
      sessionCount,
    );
    return exceeded ? TOOL_LIMIT_MESSAGE : undefined;
  }

  private bumpSessionCount(ctx: ToolContext, name: CoachToolName): void {
    if (!ctx.sessionToolCounts) {
      ctx.sessionToolCounts = {};
    }
    ctx.sessionToolCounts[name] = (ctx.sessionToolCounts[name] ?? 0) + 1;
  }

  private async getUserFitnessSnapshot(input: unknown, ctx: ToolContext) {
    const record =
      input && typeof input === 'object' ? (input as { timezoneOffsetMinutes?: number }) : {};
    const timezoneOffsetMinutes = record.timezoneOffsetMinutes ?? ctx.timezoneOffsetMinutes;

    const [userContext, memoryFacts] = await Promise.all([
      this.userContext.build(ctx.userId, { timezoneOffsetMinutes }),
      this.agentMemory.listForPrompt(ctx.userId),
    ]);

    this.bumpSessionCount(ctx, 'get_user_fitness_snapshot');
    return {
      userContext,
      memoryFacts,
    };
  }

  private async getWeather(input: unknown, ctx: ToolContext): Promise<string> {
    const record =
      input && typeof input === 'object'
        ? (input as { lat?: number; lng?: number; city?: string })
        : {};

    let lat = record.lat;
    let lng = record.lng;

    if (lat === undefined || lng === undefined) {
      const loc = ctx.locationContext;
      if (loc?.lat !== undefined && loc?.lng !== undefined) {
        lat = loc.lat;
        lng = loc.lng;
      }
    }

    const city = typeof record.city === 'string' ? record.city.trim() : '';
    if ((lat === undefined || lng === undefined) && city) {
      const geocoded = await this.amap.geocode(city);
      lat = geocoded.lat;
      lng = geocoded.lng;
    }

    if (lat === undefined || lng === undefined) {
      return WEATHER_NEED_LOCATION_MESSAGE;
    }

    const forecast = await this.weather.getForecast({ lat, lng });
    this.bumpSessionCount(ctx, 'get_weather');

    const lines = [
      forecast.summary,
      `气温：${Math.round(forecast.temperatureC)}°C`,
      forecast.precipitationMm !== undefined
        ? `降水：${forecast.precipitationMm > 0 ? `${forecast.precipitationMm}mm` : '无'}`
        : null,
      forecast.windSpeedKmh !== undefined ? `风速：${Math.round(forecast.windSpeedKmh)}km/h` : null,
      forecast.adviceHints.length ? `训练建议：${forecast.adviceHints.join('；')}` : null,
    ].filter(Boolean);

    return lines.join('\n');
  }

  private async geocodePlace(input: unknown, ctx: ToolContext) {
    const record = input && typeof input === 'object' ? (input as { query?: string }) : {};
    const query = typeof record.query === 'string' ? record.query.trim() : '';
    if (!query) {
      throw BizException.validation({ field: 'query', reason: '地点不能为空' });
    }

    const result = await this.amap.geocode(query);
    this.bumpSessionCount(ctx, 'geocode_place');

    return {
      lat: result.lat,
      lng: result.lng,
      city: result.city,
      formattedAddress: result.formattedAddress,
    };
  }

  private async searchNearbyGyms(input: unknown, ctx: ToolContext) {
    const record =
      input && typeof input === 'object'
        ? (input as { lat?: number; lng?: number; radiusM?: number })
        : {};

    let lat = record.lat;
    let lng = record.lng;

    if (lat === undefined || lng === undefined) {
      const loc = ctx.locationContext;
      if (loc?.lat !== undefined && loc?.lng !== undefined) {
        lat = loc.lat;
        lng = loc.lng;
      }
    }

    if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw BizException.validation({ field: 'lat/lng', reason: '需要有效坐标' });
    }

    const gyms = await this.amap.searchNearbyGyms({
      lat,
      lng,
      radiusM: record.radiusM,
    });

    this.bumpSessionCount(ctx, 'search_nearby_gyms');

    const searchRadiusM = record.radiusM ?? 3000;
    if (gyms.length === 0) {
      return {
        gyms: [],
        searchRadiusM,
        message: `在附近约 ${searchRadiusM}m 范围内未找到健身房；已尝试扩大搜索仍无结果。请如实告知用户，勿编造馆名。`,
      };
    }

    return {
      gyms: gyms.map((gym) => ({
        name: gym.name,
        address: gym.address,
        distanceM: gym.distanceM,
      })),
      searchRadiusM,
    };
  }

  private requireConversationContext(ctx: ToolContext): {
    conversationId: string;
    triggerMessageId: string;
  } {
    if (!ctx.conversationId || !ctx.triggerMessageId) {
      throw new BizException('VALIDATION_FAILED', '缺少对话上下文，无法派发任务', 400);
    }
    return { conversationId: ctx.conversationId, triggerMessageId: ctx.triggerMessageId };
  }

  private async enqueuePlanGenerate(input: unknown, ctx: ToolContext) {
    const parsed = parseWith(EnqueuePlanGenerateInputSchema, input);
    const { conversationId, triggerMessageId } = this.requireConversationContext(ctx);

    const taskType = parsed.planType === 'WORKOUT' ? 'PLAN_GENERATE_WORKOUT' : 'PLAN_GENERATE_MEAL';
    const limitMessage = await this.conversationTask.getDailyLimitMessage(ctx.userId, taskType);
    if (limitMessage) {
      return limitMessage;
    }

    const pendingContent =
      parsed.planType === 'WORKOUT' ? '正在生成训练计划…' : '正在生成饮食计划…';
    const pendingAction = parsed.planType === 'WORKOUT' ? 'GENERATE_WORKOUT' : 'GENERATE_MEAL';

    const result = await this.conversationTask.enqueueConversationTask({
      userId: ctx.userId,
      conversationId,
      triggerMessageId,
      taskType,
      model: LLM_MODELS.DEEPSEEK_V4_PRO,
      inputJson: {
        mesocycleWeeks: parsed.mesocycleWeeks ?? 4,
        notes: parsed.notes ?? '',
        ...(parsed.planType === 'WORKOUT' && parsed.preferences
          ? { preferences: parsed.preferences }
          : {}),
        timezoneOffsetMinutes: ctx.timezoneOffsetMinutes,
      },
      pendingContent,
      pendingAction,
    });

    this.bumpSessionCount(ctx, 'enqueue_plan_generate');

    return {
      taskId: result.taskId,
      planType: parsed.planType,
      message: ENQUEUE_SUBMITTED_MESSAGE,
    };
  }

  private async enqueueMealVision(input: unknown, ctx: ToolContext) {
    const parsed = parseWith(EnqueueMealVisionInputSchema, input);
    const imageObjectKey = parsed.imageObjectKey?.trim();

    if (!imageObjectKey) {
      return MEAL_VISION_NEED_IMAGE_MESSAGE;
    }

    const { conversationId, triggerMessageId } = this.requireConversationContext(ctx);

    const limitMessage = await this.conversationTask.getDailyLimitMessage(
      ctx.userId,
      'MEAL_VISION',
    );
    if (limitMessage) {
      return limitMessage;
    }

    const result = await this.conversationTask.enqueueConversationTask({
      userId: ctx.userId,
      conversationId,
      triggerMessageId,
      taskType: 'MEAL_VISION',
      model: LLM_MODELS.QWEN_VL_MAX,
      inputJson: {
        objectKey: imageObjectKey,
        mealType: parsed.mealType,
        saveMealLog: parsed.saveMealLog ?? false,
        timezoneOffsetMinutes: ctx.timezoneOffsetMinutes,
      },
      pendingContent: '正在识别餐食…',
      pendingAction: 'MEAL_VISION',
    });

    this.bumpSessionCount(ctx, 'enqueue_meal_vision');

    return {
      taskId: result.taskId,
      message: ENQUEUE_SUBMITTED_MESSAGE,
    };
  }
}
