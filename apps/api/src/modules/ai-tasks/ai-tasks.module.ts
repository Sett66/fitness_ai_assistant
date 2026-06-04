import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infra/prisma/prisma.module';

import { AiTasksController } from './ai-tasks.controller';
import { AiTasksService } from './ai-tasks.service';

@Module({
  imports: [PrismaModule],
  controllers: [AiTasksController],
  providers: [AiTasksService],
})
export class AiTasksModule {}
