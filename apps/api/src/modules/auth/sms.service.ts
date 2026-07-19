import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SMS_CODE_COOLDOWN_SEC,
  SMS_CODE_MAX_ATTEMPTS,
  SMS_CODE_TTL_SEC,
  errorMessagesZhCN,
} from '@fitness/shared';
import type { SendSmsCodeResponse, SmsScene } from '@fitness/shared';

import { BizException } from '../../common/exceptions/biz-exception';
import { RedisService } from '../../infra/redis/redis.service';

import { CaptchaService } from './captcha.service';
import { SMS_SENDER, type SmsSender } from './sms-sender';

@Injectable()
export class SmsService {
  constructor(
    private readonly redis: RedisService,
    private readonly captcha: CaptchaService,
    private readonly config: ConfigService,
    @Inject(SMS_SENDER) private readonly sender: SmsSender,
  ) {}

  private codeKey(scene: SmsScene, phone: string): string {
    return `auth:sms:code:${scene}:${phone}`;
  }

  private cooldownKey(scene: SmsScene, phone: string): string {
    return `auth:sms:cd:${scene}:${phone}`;
  }

  private attemptsKey(scene: SmsScene, phone: string): string {
    return `auth:sms:att:${scene}:${phone}`;
  }

  private isDevProvider(): boolean {
    return (this.config.get<string>('SMS_PROVIDER') ?? 'dev') === 'dev';
  }

  private generateCode(): string {
    if (this.isDevProvider()) {
      return this.config.get<string>('SMS_DEV_FIXED_CODE') ?? '123456';
    }
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  async sendCode(
    phone: string,
    scene: SmsScene,
    captchaToken: string,
  ): Promise<SendSmsCodeResponse> {
    const ok = await this.captcha.consumeToken(captchaToken);
    if (!ok) {
      throw new BizException('AUTH_CAPTCHA_EXPIRED', errorMessagesZhCN.AUTH_CAPTCHA_EXPIRED, 400);
    }

    const cooldownKey = this.cooldownKey(scene, phone);
    if (await this.redis.exists(cooldownKey)) {
      throw new BizException('AUTH_SMS_TOO_FREQUENT', errorMessagesZhCN.AUTH_SMS_TOO_FREQUENT, 429);
    }

    const code = this.generateCode();
    await this.redis.setEx(this.codeKey(scene, phone), code, SMS_CODE_TTL_SEC);
    await this.redis.del(this.attemptsKey(scene, phone));
    await this.redis.setEx(cooldownKey, '1', SMS_CODE_COOLDOWN_SEC);

    await this.sender.send(phone, code, scene);

    return {
      sent: true,
      cooldownSec: SMS_CODE_COOLDOWN_SEC,
      devCode: this.isDevProvider() ? code : undefined,
    };
  }

  /** 校验验证码；成功则消费掉，失败累加尝试次数 */
  async verifyCode(phone: string, scene: SmsScene, code: string): Promise<void> {
    const codeKey = this.codeKey(scene, phone);
    const stored = await this.redis.get(codeKey);
    if (stored === null) {
      throw new BizException('AUTH_SMS_CODE_INVALID', errorMessagesZhCN.AUTH_SMS_CODE_INVALID, 400);
    }

    const attempts = await this.redis.incrWithTtl(this.attemptsKey(scene, phone), SMS_CODE_TTL_SEC);
    if (attempts > SMS_CODE_MAX_ATTEMPTS) {
      await this.redis.del(codeKey);
      await this.redis.del(this.attemptsKey(scene, phone));
      throw new BizException('AUTH_SMS_CODE_INVALID', errorMessagesZhCN.AUTH_SMS_CODE_INVALID, 400);
    }

    if (stored !== code) {
      throw new BizException('AUTH_SMS_CODE_INVALID', errorMessagesZhCN.AUTH_SMS_CODE_INVALID, 400);
    }

    await this.redis.del(codeKey);
    await this.redis.del(this.attemptsKey(scene, phone));
  }
}
