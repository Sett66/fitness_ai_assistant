import { Injectable } from '@nestjs/common';
import type { CoachToolName, LocationContext } from '@fitness/shared';

import { BizException } from '../../common/exceptions/biz-exception';
import { AgentMemoryService } from '../agent-memory.service';
import { UserContextService } from '../user-context.service';

export type ToolContext = {
  userId: string;
  timezoneOffsetMinutes: number;
  locationContext?: LocationContext;
  conversationId?: string;
};

@Injectable()
export class ToolRegistryService {
  constructor(
    private readonly userContext: UserContextService,
    private readonly agentMemory: AgentMemoryService,
  ) {}

  async execute(name: CoachToolName, input: unknown, ctx: ToolContext): Promise<unknown> {
    switch (name) {
      case 'get_user_fitness_snapshot':
        return this.getUserFitnessSnapshot(input, ctx);
      case 'get_weather':
      case 'geocode_place':
      case 'search_nearby_gyms':
      case 'enqueue_plan_generate':
      case 'enqueue_meal_vision':
        throw new BizException('VALIDATION_FAILED', `工具 ${name} 尚未实现（见 AGENT-07/08）`, 501);
      default:
        throw new BizException('VALIDATION_FAILED', `未知工具：${name as string}`, 400);
    }
  }

  private async getUserFitnessSnapshot(input: unknown, ctx: ToolContext) {
    const record =
      input && typeof input === 'object' ? (input as { timezoneOffsetMinutes?: number }) : {};
    const timezoneOffsetMinutes = record.timezoneOffsetMinutes ?? ctx.timezoneOffsetMinutes;

    const [userContext, memoryFacts] = await Promise.all([
      this.userContext.build(ctx.userId, { timezoneOffsetMinutes }),
      this.agentMemory.listForPrompt(ctx.userId),
    ]);

    return {
      userContext,
      memoryFacts,
    };
  }
}
