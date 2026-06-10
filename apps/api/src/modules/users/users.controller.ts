import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';

import { UsersService, mapStrength } from './users.service';

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

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
