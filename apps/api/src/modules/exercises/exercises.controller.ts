import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { ExercisesService } from './exercises.service';

@ApiTags('exercises')
@ApiBearerAuth('access-token')
@Controller('exercises')
export class ExercisesController {
  constructor(private readonly exercises: ExercisesService) {}

  @Get()
  list(@CurrentUser() user: JwtUserPayload, @Query() query: Record<string, unknown>) {
    return this.exercises.list(user, query);
  }

  @Get(':id')
  getById(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.exercises.getById(user, id);
  }

  @Post()
  create(@CurrentUser() user: JwtUserPayload, @Body() body: unknown) {
    return this.exercises.create(user, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtUserPayload, @Param('id') id: string, @Body() body: unknown) {
    return this.exercises.update(user, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.exercises.softDelete(user, id);
  }
}
