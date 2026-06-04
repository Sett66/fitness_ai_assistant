import { Module } from '@nestjs/common';

import { MealLogsController } from './meal-logs.controller';
import { MealLogsService } from './meal-logs.service';

@Module({
  controllers: [MealLogsController],
  providers: [MealLogsService],
  exports: [MealLogsService],
})
export class MealLogsModule {}
