import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';

import { UsersService, mapStrength } from './users.service';
import { AgentMemoryService } from '../../domain/agent-memory.service';
import { CreateMemoryInputSchema, UpdateMemoryInputSchema } from '@fitness/shared';
import { parseWith } from '../../common/zod/parse-with';
import { BizException } from '../../common/exceptions/biz-exception';

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly memories: AgentMemoryService,
  ) {}

  @Get('me/memories')
  listMemories(@CurrentUser() user: JwtUserPayload) {
    return this.memories.listForUser(user.userId);
  }

  @Post('me/memories')
  async createMemory(@CurrentUser() user: JwtUserPayload, @Body() body: unknown) {
    const input = parseWith(CreateMemoryInputSchema, body);
    const saved = await this.memories.save(user.userId, { ...input, actor: 'USER' });
    return saved.memory ? mapMemory(saved.memory) : null;
  }

  @Patch('me/memories/:id')
  async updateMemory(
    @CurrentUser() user: JwtUserPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parseWith(UpdateMemoryInputSchema, body);
    const row = await this.memories.updateByUser(user.userId, id, input.value);
    if (!row) throw new BizException('NOT_FOUND', '记忆不存在', 404);
    return mapMemory(row);
  }

  @Delete('me/memories/:id')
  async deleteMemory(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    const row = await this.memories.forgetByIdForUser(user.userId, id);
    if (!row) throw new BizException('NOT_FOUND', '记忆不存在', 404);
    return { ok: true };
  }

  @Get('me')
  getMe(@CurrentUser() user: JwtUserPayload) {
    return this.users.getMe(user);
  }

  @Patch('me')
  patchMe(@CurrentUser() user: JwtUserPayload, @Body() body: unknown) {
    return this.users.updateMe(user, body);
  }

  @Get('me/profile')
  getProfile(@CurrentUser() user: JwtUserPayload) {
    return this.users.getProfile(user);
  }

  @Put('me/profile')
  putProfile(@CurrentUser() user: JwtUserPayload, @Body() body: unknown) {
    return this.users.putProfile(user, body);
  }

  @Patch('me/profile')
  patchProfile(@CurrentUser() user: JwtUserPayload, @Body() body: unknown) {
    return this.users.patchProfile(user, body);
  }

  @Delete('me/profile')
  deleteProfile(@CurrentUser() user: JwtUserPayload) {
    return this.users.deleteProfile(user);
  }

  /** 本人最近位置（仅 GET /users/me/location，无公开他人坐标 API） */
  @Get('me/location')
  getLocation(@CurrentUser() user: JwtUserPayload) {
    return this.users.getLatestLocation(user);
  }

  @Put('me/location')
  putLocation(@CurrentUser() user: JwtUserPayload, @Body() body: unknown) {
    return this.users.upsertLocation(user, body);
  }

  @Get('me/strength-levels')
  async listStrength(@CurrentUser() user: JwtUserPayload) {
    const rows = await this.users.listStrength(user);
    return rows.map(mapStrength);
  }

  @Post('me/strength-levels')
  async createStrength(@CurrentUser() user: JwtUserPayload, @Body() body: unknown) {
    const row = await this.users.createStrength(user, body);
    return mapStrength(row);
  }

  @Patch('me/strength-levels/:id')
  async patchStrength(
    @CurrentUser() user: JwtUserPayload,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const row = await this.users.updateStrength(user, id, body);
    return mapStrength(row);
  }

  @Delete('me/strength-levels/:id')
  deleteStrength(@CurrentUser() user: JwtUserPayload, @Param('id') id: string) {
    return this.users.deleteStrength(user, id);
  }
}

function mapMemory(row: {
  id: string;
  key: string;
  category: string;
  value: string;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    key: row.key,
    category: row.category,
    value: row.value,
    updatedAt: row.updatedAt,
  };
}
