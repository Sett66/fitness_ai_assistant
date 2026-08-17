import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SearchService } from './search.service';

@ApiTags('social')
@ApiBearerAuth('access-token')
@Controller('social')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('search')
  query(@CurrentUser() user: JwtUserPayload, @Query() query: Record<string, unknown>) {
    return this.search.search(user, query);
  }
}
