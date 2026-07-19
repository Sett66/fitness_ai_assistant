import { Injectable, Logger } from '@nestjs/common';
import type { SmsScene } from '@fitness/shared';

/** 短信发送抽象；真实短信（阿里云/腾讯云）后续实现同接口即可 */
export interface SmsSender {
  send(phone: string, code: string, scene: SmsScene): Promise<void>;
}

export const SMS_SENDER = Symbol('SMS_SENDER');

/**
 * 开发环境短信发送器：不真正发短信，仅打印日志。
 * 验证码由 SmsService 用固定码生成，响应里也会回传 devCode 便于联调。
 */
@Injectable()
export class DevSmsSender implements SmsSender {
  private readonly logger = new Logger('DevSmsSender');

  async send(phone: string, code: string, scene: SmsScene): Promise<void> {
    this.logger.log(`[DEV SMS] phone=${phone} scene=${scene} code=${code}`);
  }
}
