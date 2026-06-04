import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { type MealLogsService } from './meal-logs.service';

@ApiTags('meal-logs')
@ApiBearerAuth('access-token')
@Controller('meal-logs')
export class MealLogsController {
  constructor(private readonly mealLogs: MealLogsService) {}

  @Get()
  list(@CurrentUser() user: JwtUserPayload, @Query() query: Record<string, unknown>) {
    return this.mealLogs.list(user, query);
  }

  @Get('daily-summary')
  dailySummary(@CurrentUser() user: JwtUserPayload, @Query() query: Record<string, unknown>) {
    return this.mealLogs.getDailySummary(user, query);
  }

  @Get(':id')
  getById(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.mealLogs.getById(user, id);
  }

  @Post()
  create(@CurrentUser() user: JwtUserPayload, @Body() body: unknown) {
    return this.mealLogs.create(user, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.mealLogs.softDelete(user, id);
  }
}
