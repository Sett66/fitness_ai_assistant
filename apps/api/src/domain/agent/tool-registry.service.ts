import { Injectable } from '@nestjs/common';
import { formatCurrentDatetimeLine } from '@fitness/ai-core';
import type { CoachToolName, LocationContext } from '@fitness/shared';
import {
  EnqueueMealVisionInputSchema,
  EnqueuePlanGenerateInputSchema,
  LLM_MODELS,
  MemoryCategorySchema,
  MemoryKeySchema,
  normalizeMemorySlug,
} from '@fitness/shared';

import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import { AmapClient } from '../../infra/geo/amap.client';
import { WeatherClient } from '../../infra/geo/weather.client';
import { CoachToolSpanService } from '../../infra/observability/coach-tool-span.service';
import { AgentMemoryService } from '../agent-memory.service';
import { ConversationTaskService } from '../conversation-task.service';
import { UserContextService } from '../user-context.service';
import { ToolUsageService } from './tool-usage.service';
import { MemorySearchProvider } from '../../infra/search/memory-search.provider';

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
    private readonly coachToolSpan: CoachToolSpanService,
    private readonly memorySearch: MemorySearchProvider,
  ) {}

  async execute(name: CoachToolName, input: unknown, ctx: ToolContext): Promise<unknown> {
    const startedAt = Date.now();
    let output: unknown;
    let ok = true;

    try {
      const limited = await this.checkDailyLimit(name, ctx);
      if (limited) {
        output = limited;
        ok = false;
        return limited;
      }

      output = await this.dispatchTool(name, input, ctx);
      return output;
    } catch (err: unknown) {
      ok = false;
      output = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      const traceInput = isMemoryTool(name) ? summarizeMemoryInput(name, input) : input;
      const traceOutput = isMemoryTool(name)
        ? typeof output === 'string'
          ? output.replace(/：.*$/, '')
          : '记忆操作完成'
        : output;
      this.coachToolSpan.recordToolExecution({
        name,
        input: traceInput,
        output: traceOutput,
        ok,
        durationMs: Date.now() - startedAt,
      });
    }
  }

  private async dispatchTool(
    name: CoachToolName,
    input: unknown,
    ctx: ToolContext,
  ): Promise<unknown> {
    switch (name) {
      case 'get_user_fitness_snapshot':
        return this.getUserFitnessSnapshot(input, ctx);
      case 'get_current_datetime':
        return this.getCurrentDatetime(ctx);
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
      case 'save_memory':
        return this.saveMemory(input, ctx);
      case 'forget_memory':
        return this.forgetMemory(input, ctx);
      case 'recall_memory':
        return this.recallMemory(input, ctx);
      default:
        throw new BizException('VALIDATION_FAILED', `未知工具：${name as string}`, 400);
    }
  }

  private async saveMemory(input: unknown, ctx: ToolContext): Promise<string> {
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const category = MemoryCategorySchema.parse(raw.category);
    const slug = normalizeMemorySlug(String(raw.slug ?? ''));
    const value = String(raw.value ?? '').trim();
    if (!slug || !value || value.length > 512)
      throw BizException.validation({ field: 'memory', reason: '记忆内容无效' });
    if (this.memoryWriteCount(ctx) >= 2)
      throw BizException.validation({ field: 'memory', reason: '本轮记忆写入已达上限' });
    if (/(今天|明天|昨天|这周|本周|刚才|现在|今晚|今早)/.test(value))
      throw BizException.validation({ field: 'value', reason: '时效信息不能写入长期记忆' });
    const key = `${category}:${slug}`;
    if (await this.agentMemory.isSuppressed(ctx.userId, key))
      throw BizException.validation({ field: 'key', reason: '用户已删除该记忆，不能自动恢复' });
    await this.agentMemory.enqueuePersist(ctx.userId, {
      op: 'save',
      category,
      slug,
      value,
      confidence: typeof raw.confidence === 'number' ? raw.confidence : undefined,
      sourceMessageId: ctx.triggerMessageId,
    });
    this.bumpSessionCount(ctx, 'save_memory');
    return '已记录';
  }

  private async forgetMemory(input: unknown, ctx: ToolContext): Promise<string> {
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const key = MemoryKeySchema.parse(raw.key);
    if (this.memoryWriteCount(ctx) >= 2)
      throw BizException.validation({ field: 'memory', reason: '本轮记忆写入已达上限' });
    const exists = await this.agentMemory.listForPrompt(ctx.userId, 60);
    if (!exists.some((fact) => fact.key === key)) return '没有这条记忆';
    await this.agentMemory.enqueuePersist(ctx.userId, {
      op: 'forget',
      key,
      sourceMessageId: ctx.triggerMessageId,
    });
    this.bumpSessionCount(ctx, 'forget_memory');
    return '已提交删除';
  }

  private async recallMemory(input: unknown, ctx: ToolContext): Promise<unknown> {
    const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
    const query = String(raw.query ?? '').trim();
    if (!query || query.length > 200)
      throw BizException.validation({ field: 'query', reason: '查询内容无效' });
    const category =
      raw.category === undefined ? undefined : MemoryCategorySchema.parse(raw.category);
    let memories: Array<{
      id?: string;
      key: string;
      category: import('@fitness/shared').MemoryCategory;
      value: string;
    }>;
    try {
      memories = await this.memorySearch.search(ctx.userId, query, { category });
    } catch {
      memories = (await this.agentMemory.listForPrompt(ctx.userId, 20))
        .filter((fact) => !category || fact.category === category)
        .slice(0, 5);
    }
    void this.agentMemory
      .markUsed(memories.flatMap((memory) => (memory.id ? [memory.id] : [])))
      .catch(() => undefined);
    this.bumpSessionCount(ctx, 'recall_memory');
    return { memories };
  }

  private memoryWriteCount(ctx: ToolContext): number {
    return (ctx.sessionToolCounts?.save_memory ?? 0) + (ctx.sessionToolCounts?.forget_memory ?? 0);
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

    const userContext = await this.userContext.build(ctx.userId, { timezoneOffsetMinutes });

    this.bumpSessionCount(ctx, 'get_user_fitness_snapshot');
    return {
      userContext,
    };
  }

  private getCurrentDatetime(ctx: ToolContext): string {
    return formatCurrentDatetimeLine(new Date(), ctx.timezoneOffsetMinutes);
  }

  private async getWeather(input: unknown, ctx: ToolContext): Promise<string> {
    const record =
      input && typeof input === 'object'
        ? (input as { lat?: number; lng?: number; city?: string; days?: number })
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

    const days =
      typeof record.days === 'number' && Number.isFinite(record.days) ? record.days : undefined;
    const forecast = await this.weather.getForecast({ lat, lng, days });
    this.bumpSessionCount(ctx, 'get_weather');

    const lines = [
      `当前天气：${forecast.summary}`,
      forecast.precipitationMm !== undefined
        ? `当前降水：${forecast.precipitationMm > 0 ? `${forecast.precipitationMm}mm` : '无'}`
        : null,
      forecast.windSpeedKmh !== undefined
        ? `当前风速：${Math.round(forecast.windSpeedKmh)}km/h`
        : null,
      forecast.adviceHints.length ? `训练建议：${forecast.adviceHints.join('；')}` : null,
    ].filter(Boolean) as string[];

    if (forecast.daily?.length) {
      lines.push('未来逐日预报（含今日，按日期）：');
      for (const day of forecast.daily) {
        const parts = [`${day.date} ${day.weekday}`.trim()];
        parts.push(`${Math.round(day.tempMinC)}~${Math.round(day.tempMaxC)}°C`);
        if (day.precipitationProbabilityPct !== undefined) {
          parts.push(`降水概率${day.precipitationProbabilityPct}%`);
        }
        if (day.precipitationMm !== undefined && day.precipitationMm > 0) {
          parts.push(`降水${day.precipitationMm}mm`);
        }
        if (day.windSpeedMaxKmh !== undefined) {
          parts.push(`风力≤${Math.round(day.windSpeedMaxKmh)}km/h`);
        }
        lines.push(`- ${parts.join('，')}`);
      }
    }

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

function isMemoryTool(name: CoachToolName): boolean {
  return name === 'save_memory' || name === 'forget_memory' || name === 'recall_memory';
}

function summarizeMemoryInput(name: CoachToolName, input: unknown): string {
  if (!input || typeof input !== 'object') return name;
  const value = input as Record<string, unknown>;
  if (name === 'save_memory')
    return `${String(value.category ?? 'unknown')}:${normalizeMemorySlug(String(value.slug ?? ''))}`;
  if (name === 'forget_memory') return String(value.key ?? '').slice(0, 80);
  return 'recall';
}
