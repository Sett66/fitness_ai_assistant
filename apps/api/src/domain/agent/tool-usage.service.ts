import { Injectable } from '@nestjs/common';
import {
  CoachToolNameSchema,
  CoachToolTraceItemSchema,
  getCoachToolDailyLimit,
  type CoachToolName,
} from '@fitness/shared';

import { PrismaService } from '../../infra/prisma/prisma.service';

/** 按用户自然日聚合 COACH_CHAT 的 toolTrace 计数（ADR 0008 §6） */
@Injectable()
export class ToolUsageService {
  constructor(private readonly prisma: PrismaService) {}

  async countTodayUsage(
    userId: string,
    toolName: CoachToolName,
    timezoneOffsetMinutes: number,
  ): Promise<number> {
    const limit = getCoachToolDailyLimit(toolName);
    if (limit === undefined) {
      return 0;
    }

    const dayStart = this.getUserDayStart(timezoneOffsetMinutes);
    const runs = await this.prisma.client.aiRun.findMany({
      where: {
        userId,
        taskType: 'COACH_CHAT',
        status: 'DONE',
        createdAt: { gte: dayStart },
      },
      select: { outputJson: true },
    });

    let count = 0;
    for (const run of runs) {
      const output = run.outputJson;
      if (!output || typeof output !== 'object') continue;
      const toolTrace = (output as { toolTrace?: unknown }).toolTrace;
      if (!Array.isArray(toolTrace)) continue;
      for (const item of toolTrace) {
        const parsed = CoachToolTraceItemSchema.safeParse(item);
        if (parsed.success && parsed.data.name === toolName && parsed.data.ok) {
          count += 1;
        }
      }
    }
    return count;
  }

  async isDailyLimitExceeded(
    userId: string,
    toolName: CoachToolName,
    timezoneOffsetMinutes: number,
    sessionCount = 0,
  ): Promise<boolean> {
    const limit = getCoachToolDailyLimit(toolName);
    if (limit === undefined) {
      return false;
    }
    const dbCount = await this.countTodayUsage(userId, toolName, timezoneOffsetMinutes);
    return dbCount + sessionCount >= limit;
  }

  private getUserDayStart(timezoneOffsetMinutes: number): Date {
    const localMs = Date.now() + timezoneOffsetMinutes * 60_000;
    const local = new Date(localMs);
    const y = local.getUTCFullYear();
    const m = local.getUTCMonth();
    const d = local.getUTCDate();
    return new Date(Date.UTC(y, m, d) - timezoneOffsetMinutes * 60_000);
  }

  /** 校验工具名是否受日限约束 */
  isLimitedTool(name: string): name is CoachToolName {
    return (
      CoachToolNameSchema.safeParse(name).success &&
      getCoachToolDailyLimit(name as CoachToolName) !== undefined
    );
  }
}
