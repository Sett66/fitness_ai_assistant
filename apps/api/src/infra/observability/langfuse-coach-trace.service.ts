import { Injectable, Logger } from '@nestjs/common';

import { ObservabilityConfigService } from '../../config/observability-config.service';
import {
  CoachChatTraceSession,
  createCoachChatTraceSession,
  type BeginCoachChatTraceParams,
} from './coach-chat-trace.session';

@Injectable()
export class LangfuseCoachTraceService {
  private readonly logger = new Logger(LangfuseCoachTraceService.name);

  constructor(private readonly observabilityConfig: ObservabilityConfigService) {}

  beginCoachChatTrace(
    params: Omit<BeginCoachChatTraceParams, 'environment' | 'baseUrl'>,
  ): CoachChatTraceSession | null {
    if (!this.observabilityConfig.isLangfuseEnabled() || !this.observabilityConfig.shouldSample()) {
      return null;
    }

    if (!this.observabilityConfig.getPublicKey() || !this.observabilityConfig.getSecretKey()) {
      this.logger.warn('LANGFUSE_ENABLED=true 但未配置 LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY');
      return null;
    }

    try {
      return createCoachChatTraceSession(
        {
          ...params,
          environment: this.observabilityConfig.getEnvironment(),
          baseUrl: this.observabilityConfig.getBaseUrl(),
        },
        (message) => this.logger.warn(message),
      );
    } catch (err: unknown) {
      this.logger.warn(`Langfuse trace 创建失败: ${this.formatError(err)}`);
      return null;
    }
  }

  private formatError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
