import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { AiTasksService } from './ai-tasks.service';

@ApiTags('ai')
@ApiBearerAuth('access-token')
@Controller('ai')
export class AiTasksController {
  constructor(private readonly ai: AiTasksService) {}

  @Post('tasks')
  enqueue(@CurrentUser() user: JwtUserPayload, @Body() body: unknown) {
    return this.ai.enqueue(user, body);
  }

  @Get('tasks/:taskId')
  status(@CurrentUser() user: JwtUserPayload, @Param('taskId') taskId: string) {
    return this.ai.getStatus(user, taskId);
  }
}
