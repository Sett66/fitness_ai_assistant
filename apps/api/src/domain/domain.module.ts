import { Global, Module } from '@nestjs/common';

import { AgentConfigService } from '../config/agent-config.service';
import { GeoModule } from '../infra/geo/geo.module';
import { ObservabilityModule } from '../infra/observability/observability.module';
import { StorageModule } from '../infra/storage/storage.module';
import { CoachAgentRunner } from './agent/coach-agent.runner';
import { CoachImageContextService } from './coach-image-context.service';
import { ToolRegistryService } from './agent/tool-registry.service';
import { ToolUsageService } from './agent/tool-usage.service';
import { AgentMemoryService } from './agent-memory.service';
import { ConversationSideEffectService } from './conversation-side-effect.service';
import { ConversationTaskService } from './conversation-task.service';
import { MealNutritionService } from './meal-nutrition.service';
import { NutritionDailyService } from './nutrition-daily.service';
import { PlanPersistenceService } from './plan-persistence.service';
import { UserContextService } from './user-context.service';

@Global()
@Module({
  imports: [GeoModule, ObservabilityModule, StorageModule],
  providers: [
    AgentConfigService,
    AgentMemoryService,
    CoachAgentRunner,
    CoachImageContextService,
    NutritionDailyService,
    PlanPersistenceService,
    ToolRegistryService,
    ToolUsageService,
    UserContextService,
    ConversationSideEffectService,
    ConversationTaskService,
    MealNutritionService,
  ],
  exports: [
    AgentConfigService,
    AgentMemoryService,
    CoachAgentRunner,
    CoachImageContextService,
    NutritionDailyService,
    UserContextService,
    PlanPersistenceService,
    ToolRegistryService,
    ToolUsageService,
    ConversationSideEffectService,
    ConversationTaskService,
    MealNutritionService,
  ],
})
export class DomainModule {}
