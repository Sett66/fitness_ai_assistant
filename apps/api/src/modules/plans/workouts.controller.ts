import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { WorkoutsService } from './plans.service';

@ApiTags('workouts')
@ApiBearerAuth('access-token')
@Controller('workouts')
export class WorkoutsController {
  constructor(private readonly workouts: WorkoutsService) {}

  @Get('sessions')
  listSessions(@CurrentUser() user: JwtUserPayload, @Query() query: Record<string, unknown>) {
    return this.workouts.list(user, query);
  }

  @Get('sessions/:id')
  getSession(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.workouts.getById(user, id);
  }

  @Post('sessions')
  createSession(@CurrentUser() user: JwtUserPayload, @Body() body: unknown) {
    return this.workouts.create(user, body);
  }
}
