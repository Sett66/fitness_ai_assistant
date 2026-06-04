import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infra/prisma/prisma.module';

import { ExercisesController } from './exercises.controller';
import { ExercisesService } from './exercises.service';

@Module({
  imports: [PrismaModule],
  controllers: [ExercisesController],
  providers: [ExercisesService],
})
export class ExercisesModule {}
