import {
  runCoachAgentStream,
  type CoachAgentRunnerEvent,
  type RunCoachAgentStreamInput,
} from '@fitness/ai-core';
import { Injectable } from '@nestjs/common';
import type {
  AgentMemoryFact,
  CoachToolName,
  LocationContext,
  UserAiContext,
} from '@fitness/shared';

import { ToolRegistryService } from './tool-registry.service';

export type CoachAgentRunInput = {
  latestUserText: string;
  history: RunCoachAgentStreamInput['history'];
  userContext: UserAiContext;
  memoryFacts: AgentMemoryFact[];
  locationContext?: LocationContext;
  timezoneOffsetMinutes: number;
  conversationId?: string;
  triggerMessageId?: string;
};

@Injectable()
export class CoachAgentRunner {
  constructor(private readonly toolRegistry: ToolRegistryService) {}

  run(
    userId: string,
    input: CoachAgentRunInput,
    options?: { model?: string },
  ): AsyncGenerator<CoachAgentRunnerEvent> {
    const sessionToolCounts: Partial<Record<CoachToolName, number>> = {};

    const invokeTool = async (name: CoachToolName, toolInput: unknown) => {
      const result = await this.toolRegistry.execute(name, toolInput, {
        userId,
        timezoneOffsetMinutes: input.timezoneOffsetMinutes,
        locationContext: input.locationContext,
        conversationId: input.conversationId,
        triggerMessageId: input.triggerMessageId,
        sessionToolCounts,
      });

      const observation = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      const summary = this.summarizeToolResult(name, result);

      return { observation, summary };
    };

    return runCoachAgentStream(
      {
        latestUserText: input.latestUserText,
        history: input.history,
        userContext: input.userContext,
        memoryFacts: input.memoryFacts,
        locationContext: input.locationContext,
        timezoneOffsetMinutes: input.timezoneOffsetMinutes,
      },
      {
        model: options?.model,
        invokeTool,
      },
    );
  }

  private summarizeToolResult(name: CoachToolName, result: unknown): string {
    if (name === 'get_user_fitness_snapshot' && result && typeof result === 'object') {
      const record = result as {
        userContext?: { todayNutrition?: { remainingKcal?: number; consumedKcal?: number } };
      };
      const nutrition = record.userContext?.todayNutrition;
      if (nutrition) {
        return `今日已摄入 ${nutrition.consumedKcal ?? '?'} kcal，剩余 ${nutrition.remainingKcal ?? '?'} kcal`;
      }
      return '已读取健身档案与营养摘要';
    }

    if (name === 'get_current_datetime' && typeof result === 'string') {
      return result.slice(0, 120);
    }

    if (name === 'get_weather' && typeof result === 'string') {
      return result.split('\n')[0]?.slice(0, 120) ?? '天气查询完成';
    }

    if (name === 'geocode_place' && result && typeof result === 'object') {
      const record = result as { city?: string; formattedAddress?: string };
      return record.formattedAddress ?? record.city ?? '地点解析完成';
    }

    if (name === 'search_nearby_gyms' && result && typeof result === 'object') {
      const record = result as {
        gyms?: Array<{ name?: string }>;
        message?: string;
      };
      const count = record.gyms?.length ?? 0;
      const first = record.gyms?.[0]?.name;
      if (count === 0) {
        return record.message?.slice(0, 120) ?? '附近未找到健身房';
      }
      return first ? `找到 ${count} 家，最近：${first}` : `找到 ${count} 家健身房`;
    }

    if (name === 'enqueue_plan_generate' && result && typeof result === 'object') {
      const record = result as { planType?: string; message?: string };
      const label = record.planType === 'WORKOUT' ? '训练' : '饮食';
      return record.message ?? `${label}计划任务已提交`;
    }

    if (name === 'enqueue_meal_vision') {
      if (typeof result === 'string') {
        return result.slice(0, 120);
      }
      const record = result as { message?: string };
      return record.message ?? '识图任务已提交';
    }

    return typeof result === 'string' ? result.slice(0, 120) : '工具执行完成';
  }
}
