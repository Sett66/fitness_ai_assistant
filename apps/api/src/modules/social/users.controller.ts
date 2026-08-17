import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SocialUsersService } from './social-users.service';

@ApiTags('social')
@ApiBearerAuth('access-token')
@Controller('social/users')
export class SocialUsersController {
  constructor(private readonly socialUsers: SocialUsersService) {}

  @Get(':userId')
  profile(@Param('userId') userId: string) {
    return this.socialUsers.getProfile(userId);
  }

  @Get(':userId/posts')
  posts(
    @CurrentUser() user: JwtUserPayload,
    @Param('userId') userId: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.socialUsers.listPosts(user, userId, query);
  }
}
