import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LoginRequestSchema, RefreshRequestSchema, RegisterRequestSchema } from '@fitness/shared';

import { Public } from '../../common/decorators/public.decorator';
import { parseWith } from '../../common/zod/parse-with';

import { type AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() body: unknown) {
    return this.auth.register(parseWith(RegisterRequestSchema, body));
  }

  @Public()
  @Post('login')
  login(@Body() body: unknown) {
    return this.auth.login(parseWith(LoginRequestSchema, body));
  }

  @Public()
  @Post('refresh')
  refresh(@Body() body: unknown) {
    return this.auth.refresh(parseWith(RefreshRequestSchema, body));
  }

  @Public()
  @Post('logout')
  logout(@Body() body: unknown) {
    return this.auth.logout(parseWith(RefreshRequestSchema, body));
  }
}
