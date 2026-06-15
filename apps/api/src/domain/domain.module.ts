import { Global, Module } from '@nestjs/common';

import { AgentConfigService } from '../config/agent-config.service';
import { GeoModule } from '../infra/geo/geo.module';
import { CoachAgentRunner } from './agent/coach-agent.runner';
import { ToolRegistryService } from './agent/tool-registry.service';
import { ToolUsageService } from './agent/tool-usage.service';
import { AgentMemoryService } from './agent-memory.service';
import { ConversationSideEffectService } from './conversation-side-effect.service';
import { NutritionDailyService } from './nutrition-daily.service';
import { PlanPersistenceService } from './plan-persistence.service';
import { UserContextService } from './user-context.service';

@Global()
@Module({
  imports: [GeoModule],
  providers: [
    AgentConfigService,
    AgentMemoryService,
    CoachAgentRunner,
    NutritionDailyService,
    PlanPersistenceService,
    ToolRegistryService,
    ToolUsageService,
    UserContextService,
    ConversationSideEffectService,
  ],
  exports: [
    AgentConfigService,
    AgentMemoryService,
    CoachAgentRunner,
    NutritionDailyService,
    UserContextService,
    PlanPersistenceService,
    ToolRegistryService,
    ToolUsageService,
    ConversationSideEffectService,
  ],
})
export class DomainModule {}
