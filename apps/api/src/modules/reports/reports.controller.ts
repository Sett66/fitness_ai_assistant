import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth('access-token')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  create(@CurrentUser() user: JwtUserPayload, @Body() body: unknown) {
    return this.reports.create(user, body);
  }

  @Get()
  list(@CurrentUser() user: JwtUserPayload) {
    return this.reports.list(user);
  }

  @Get(':id')
  detail(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.reports.detail(user, id);
  }
}
