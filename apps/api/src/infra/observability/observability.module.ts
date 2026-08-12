import { Global, Module } from '@nestjs/common';

import { ObservabilityConfigService } from '../../config/observability-config.service';
import { CoachToolSpanService } from './coach-tool-span.service';
import { LangfuseCoachTraceService } from './langfuse-coach-trace.service';

@Global()
@Module({
  providers: [ObservabilityConfigService, LangfuseCoachTraceService, CoachToolSpanService],
  exports: [ObservabilityConfigService, LangfuseCoachTraceService, CoachToolSpanService],
})
export class ObservabilityModule {}
