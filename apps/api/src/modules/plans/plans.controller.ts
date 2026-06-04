import { Body, Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { type PlansService } from './plans.service';

@ApiTags('plans')
@ApiBearerAuth('access-token')
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list(@CurrentUser() user: JwtUserPayload, @Query() query: Record<string, unknown>) {
    return this.plans.list(user, query);
  }

  @Patch(':planId/workout-days/:dayId/items/:itemId')
  updateWorkoutItem(
    @CurrentUser() user: JwtUserPayload,
    @Param('planId') planId: string,
    @Param('dayId') dayId: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
  ) {
    return this.plans.updateWorkoutPlanItem(user, planId, dayId, itemId, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.plans.softDelete(user, id);
  }

  @Get(':id')
  getById(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.plans.getById(user, id);
  }
}
