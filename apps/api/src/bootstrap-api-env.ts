import { initLangfuseInstrumentation } from './instrumentation';
import { loadApiEnv } from './load-api-env';

export function bootstrapApiEnv(): void {
  loadApiEnv();
  initLangfuseInstrumentation();
}
