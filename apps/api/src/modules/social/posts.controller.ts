import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PostsService } from './posts.service';

@ApiTags('social')
@ApiBearerAuth('access-token')
@Controller('social/posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Post()
  create(@CurrentUser() user: JwtUserPayload, @Body() body: unknown) {
    return this.posts.create(user, body);
  }

  @Get()
  list(@CurrentUser() user: JwtUserPayload, @Query() query: Record<string, unknown>) {
    return this.posts.listFeed(user, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.posts.getById(user, id);
  }

  @Put(':id/like')
  like(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.posts.like(user, id);
  }

  @Delete(':id/like')
  unlike(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.posts.unlike(user, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.posts.softDelete(user, id);
  }
}
