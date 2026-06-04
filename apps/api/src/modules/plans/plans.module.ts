import { Module } from '@nestjs/common';

import { PlansController } from './plans.controller';
import { PlansService, WorkoutsService } from './plans.service';
import { WorkoutsController } from './workouts.controller';

@Module({
  controllers: [PlansController, WorkoutsController],
  providers: [PlansService, WorkoutsService],
  exports: [PlansService, WorkoutsService],
})
export class PlansModule {}
