import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { type FoodsService } from './foods.service';

@ApiTags('foods')
@ApiBearerAuth('access-token')
@Controller('foods')
export class FoodsController {
  constructor(private readonly foods: FoodsService) {}

  @Get()
  list(@CurrentUser() user: JwtUserPayload, @Query() query: Record<string, unknown>) {
    return this.foods.list(user, query);
  }

  @Get(':id')
  getById(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.foods.getById(user, id);
  }

  @Post()
  create(@CurrentUser() user: JwtUserPayload, @Body() body: unknown) {
    return this.foods.create(user, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtUserPayload, @Param('id') id: string, @Body() body: unknown) {
    return this.foods.update(user, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.foods.softDelete(user, id);
  }
}
