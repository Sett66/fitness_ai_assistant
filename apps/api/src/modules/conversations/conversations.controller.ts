import { Body, Controller, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';

import { ConversationsService } from './conversations.service';

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
  ) {
    return this.conversations.startMessageStream(user, id, body);
  }

  @Get(':id/message-streams/:streamId')
  async subscribeMessageStream(
    @CurrentUser() user: JwtUserPayload,
    @Param('id') id: string,
    @Param('streamId') streamId: string,
    @Query('afterSequence') afterSequence: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const cursor = Number(afterSequence ?? '0');
    if (!Number.isSafeInteger(cursor) || cursor < 0) {
      throw new BizException('VALIDATION_FAILED', 'afterSequence 必须是非负整数', 400);
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    let disconnected = false;
    res.on('close', () => {
      disconnected = true;
    });

    const writeEvent = (event: string, data: unknown) => {
      if (!disconnected && !res.writableEnded) {
        if (event === 'ping') {
          res.write(': ping\n\n');
          return;
        }
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }
    };

    try {
      await this.conversations.subscribeMessageStream(
        user,
        id,
        streamId,
        cursor,
        writeEvent,
        () => disconnected || req.destroyed,
      );
    } catch (err: unknown) {
      if (!res.writableEnded && !disconnected) {
        const message = err instanceof BizException ? err.message : '流式订阅失败';
        const code = err instanceof BizException ? err.code : 'STREAM_SUBSCRIBE_FAILED';
        writeEvent('error', { message, code });
      }
    } finally {
      if (!res.writableEnded && !res.destroyed) res.end();
    }
  }

  @Post(':id/message-streams/:streamId/cancel')
  cancelMessageStream(
    @CurrentUser() user: JwtUserPayload,
    @Param('id') id: string,
    @Param('streamId') streamId: string,
  ) {
    return this.conversations.cancelMessageStream(user, id, streamId);
  }

  @Post(':id/messages')
  postMessage(@CurrentUser() user: JwtUserPayload, @Param('id') id: string, @Body() body: unknown) {
    return this.conversations.postMessage(user, id, body);
  }
}
