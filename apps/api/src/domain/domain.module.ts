import { Global, Module } from '@nestjs/common';

import { AgentConfigService } from '../config/agent-config.service';
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
    NutritionDailyService,
    UserContextService,
    PlanPersistenceService,
    ConversationSideEffectService,
  ],
  exports: [
    AgentConfigService,
    AgentMemoryService,
    NutritionDailyService,
    UserContextService,
    PlanPersistenceService,
    ConversationSideEffectService,
  ],
})
export class DomainModule {}
