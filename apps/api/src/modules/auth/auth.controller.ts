import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CaptchaVerifyRequestSchema,
  LoginRequestSchema,
  RefreshRequestSchema,
  RegisterRequestSchema,
  ResetPasswordRequestSchema,
  SendSmsCodeRequestSchema,
} from '@fitness/shared';

import { Public } from '../../common/decorators/public.decorator';
import { parseWith } from '../../common/zod/parse-with';

import { AuthService } from './auth.service';
import { CaptchaService } from './captcha.service';
import { SmsService } from './sms.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly captcha: CaptchaService,
    private readonly sms: SmsService,
  ) {}

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

  @Public()
  @Post('captcha/challenge')
  captchaChallenge() {
    return this.captcha.challenge();
  }

  @Public()
  @Post('captcha/verify')
  captchaVerify(@Body() body: unknown) {
    const input = parseWith(CaptchaVerifyRequestSchema, body);
    return this.captcha.verify(input.captchaId, input.x);
  }

  @Public()
  @Post('send-sms-code')
  sendSmsCode(@Body() body: unknown) {
    const input = parseWith(SendSmsCodeRequestSchema, body);
    return this.sms.sendCode(input.phone, input.scene, input.captchaToken);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() body: unknown) {
    return this.auth.resetPassword(parseWith(ResetPasswordRequestSchema, body));
  }
}
