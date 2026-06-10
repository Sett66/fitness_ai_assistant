import { Injectable } from '@nestjs/common';
import { type ConfigService } from '@nestjs/config';

@Injectable()
export class AgentConfigService {
  constructor(private readonly config: ConfigService) {}

  isCoachAgentEnabled(): boolean {
    return this.config.get<string>('COACH_AGENT_ENABLED', 'false') === 'true';
  }
}
