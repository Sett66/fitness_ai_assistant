import { Global, Module } from '@nestjs/common';

import { AgentConfigService } from '../config/agent-config.service';
import { CoachAgentRunner } from './agent/coach-agent.runner';
import { ToolRegistryService } from './agent/tool-registry.service';
import { AgentMemoryService } from './agent-memory.service';
import { ConversationSideEffectService } from './conversation-side-effect.service';
import { NutritionDailyService } from './nutrition-daily.service';
import { PlanPersistenceService } from './plan-persistence.service';
import { UserContextService } from './user-context.service';

@Global()
@Module({
  providers: [
    AgentConfigService,
    AgentMemoryService,
    CoachAgentRunner,
    NutritionDailyService,
    PlanPersistenceService,
    ToolRegistryService,
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
    ConversationSideEffectService,
  ],
})
export class DomainModule {}
