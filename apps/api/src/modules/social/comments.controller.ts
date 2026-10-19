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
import { CommentsService } from './comments.service';

@ApiTags('social')
@ApiBearerAuth('access-token')
@Controller('social')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('posts/:id/comments')
  list(
    @CurrentUser() user: JwtUserPayload,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.comments.list(user, id, query);
  }

  @Post('posts/:id/comments')
  create(@CurrentUser() user: JwtUserPayload, @Param('id') id: string, @Body() body: unknown) {
    return this.comments.create(user, id, body);
  }

  @Put('comments/:id/like')
  like(@CurrentUser() user: JwtUserPayload, @Param('id') id: string, @Body() body: unknown) {
    return this.comments.setLikeState(user, id, true, body);
  }

  @Delete('comments/:id/like')
  unlike(@CurrentUser() user: JwtUserPayload, @Param('id') id: string, @Body() body: unknown) {
    return this.comments.setLikeState(user, id, false, body);
  }

  @Get('comments/:id/like')
  likeState(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.comments.getLikeState(user, id);
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.comments.remove(user, id);
  }
}
