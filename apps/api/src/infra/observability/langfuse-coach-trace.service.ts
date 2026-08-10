import { Injectable, Logger } from '@nestjs/common';
import { Langfuse } from 'langfuse';

import { ObservabilityConfigService } from '../../config/observability-config.service';
import {
  CoachChatTraceSession,
  createCoachChatTraceSession,
  type BeginCoachChatTraceParams,
} from './coach-chat-trace.session';

@Injectable()
export class LangfuseCoachTraceService {
  private readonly logger = new Logger(LangfuseCoachTraceService.name);
  private client: Langfuse | null | undefined;

  constructor(private readonly observabilityConfig: ObservabilityConfigService) {}

  beginCoachChatTrace(params: BeginCoachChatTraceParams): CoachChatTraceSession | null {
    if (!this.observabilityConfig.isLangfuseEnabled() || !this.observabilityConfig.shouldSample()) {
      return null;
    }

    const langfuse = this.getClient();
    if (!langfuse) {
      return null;
    }

    try {
      return createCoachChatTraceSession(langfuse, params, (message) => this.logger.warn(message));
    } catch (err: unknown) {
      this.logger.warn(`Langfuse trace 创建失败: ${this.formatError(err)}`);
      return null;
    }
  }

  private getClient(): Langfuse | null {
    if (this.client !== undefined) {
      return this.client;
    }

    const publicKey = this.observabilityConfig.getPublicKey();
    const secretKey = this.observabilityConfig.getSecretKey();
    if (!publicKey || !secretKey) {
      this.logger.warn('LANGFUSE_ENABLED=true 但未配置 LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY');
      this.client = null;
      return null;
    }

    try {
      this.client = new Langfuse({
        publicKey,
        secretKey,
        baseUrl: this.observabilityConfig.getBaseUrl(),
      });
    } catch (err: unknown) {
      this.logger.warn(`Langfuse 客户端初始化失败: ${this.formatError(err)}`);
      this.client = null;
    }

    return this.client;
  }

  private formatError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
