import { Global, Module } from '@nestjs/common';

import { ObservabilityConfigService } from '../../config/observability-config.service';
import { LangfuseCoachTraceService } from './langfuse-coach-trace.service';

@Global()
@Module({
  providers: [ObservabilityConfigService, LangfuseCoachTraceService],
  exports: [ObservabilityConfigService, LangfuseCoachTraceService],
})
export class ObservabilityModule {}
