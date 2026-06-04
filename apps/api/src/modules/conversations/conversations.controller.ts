import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';

import { type ConversationsService } from './conversations.service';

@ApiTags('conversations')
@ApiBearerAuth('access-token')
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  listConversations(@CurrentUser() user: JwtUserPayload, @Query('cursor') cursor?: string) {
    return this.conversations.listConversations(user, cursor);
  }

  @Post()
  createConversation(@CurrentUser() user: JwtUserPayload, @Body() body: unknown) {
    return this.conversations.createConversation(user, body);
  }

  @Get('default')
  getDefault(@CurrentUser() user: JwtUserPayload) {
    return this.conversations.getDefault(user);
  }

  @Get(':id')
  getById(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.conversations.getById(user, id);
  }

  @Get(':id/messages')
  listMessages(
    @CurrentUser() user: JwtUserPayload,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.conversations.listMessages(user, id, cursor);
  }

  @Post(':id/messages/stream')
  async postMessageStream(
    @CurrentUser() user: JwtUserPayload,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const writeEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      await this.conversations.postMessageStream(user, id, body, writeEvent);
    } catch (err: unknown) {
      if (!res.headersSent) {
        res.status(400);
      }
      const message =
        err instanceof BizException
          ? err.message
          : err instanceof Error
            ? err.message
            : '流式请求失败';
      const code = err instanceof BizException ? err.code : undefined;
      writeEvent('error', { message, code });
    } finally {
      res.end();
    }
  }

  @Post(':id/messages')
  postMessage(@CurrentUser() user: JwtUserPayload, @Param('id') id: string, @Body() body: unknown) {
    return this.conversations.postMessage(user, id, body);
  }
}
