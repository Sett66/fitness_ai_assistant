import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { envValidationSchema } from './config/env.schema';
import { DomainModule } from './domain/domain.module';
import { FitnessQueueModule } from './infra/queue/fitness-queue.module';
import { PrismaModule } from './infra/prisma/prisma.module';
import { StorageModule } from './infra/storage/storage.module';
import { MealLogsModule } from './modules/meal-logs/meal-logs.module';
import { AiTaskProcessor } from './workers/ai-task.processor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envValidationSchema }),
    PrismaModule,
    DomainModule,
    StorageModule,
    FitnessQueueModule,
    MealLogsModule,
  ],
  providers: [AiTaskProcessor],
})
export class WorkerRootModule {}
