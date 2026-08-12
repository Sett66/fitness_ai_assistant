import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AgentConfigService } from './config/agent-config.service';
import { ObservabilityConfigService } from './config/observability-config.service';
import { Public } from './common/decorators/public.decorator';

@ApiTags('meta')
@Controller()
export class AppController {
  constructor(
    private readonly agentConfig: AgentConfigService,
    private readonly observabilityConfig: ObservabilityConfigService,
  ) {}

  @Public()
  @Get('health')
  health(): { ok: true } {
    return { ok: true };
  }

  /** 便于客户端探活与验收脚本读取运行时配置：`GET /v1` */
  @Public()
  @Get()
  root(): Readonly<{
    service: string;
    version: string;
    coachAgentEnabled: boolean;
    langfuseEnabled: boolean;
    langfuseConfigured: boolean;
    langfuseBaseUrl: string;
  }> {
    const langfuseEnabled = this.observabilityConfig.isLangfuseEnabled();
    const langfuseConfigured =
      langfuseEnabled &&
      Boolean(this.observabilityConfig.getPublicKey()) &&
      Boolean(this.observabilityConfig.getSecretKey());

    return {
      service: 'fitness-api',
      version: '0.0.0-m2',
      coachAgentEnabled: this.agentConfig.isCoachAgentEnabled(),
      langfuseEnabled,
      langfuseConfigured,
      langfuseBaseUrl: this.observabilityConfig.getBaseUrl(),
    } as const;
  }
}
