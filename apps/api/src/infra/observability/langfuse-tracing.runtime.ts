import { createRequire } from 'node:module';

const cjsRequire = createRequire(__filename);

export type LangfuseObservation = {
  id: string;
  traceId: string;
  update: (attributes: Record<string, unknown>) => LangfuseObservation;
  updateTrace: (attributes: Record<string, unknown>) => LangfuseObservation;
  end: (endTime?: number | Date) => void;
  startObservation: (
    name: string,
    attributes?: Record<string, unknown>,
    options?: { asType?: string },
  ) => LangfuseObservation;
};

export type LangfuseTracingRuntime = {
  createTraceId: (seed?: string) => Promise<string>;
  updateActiveTrace: (attributes: Record<string, unknown>) => void;
  startActiveObservation: <T>(
    name: string,
    fn: (span: LangfuseObservation) => Promise<T> | T,
    options?: {
      parentSpanContext?: {
        traceId: string;
        spanId: string;
        traceFlags: number;
      };
    },
  ) => Promise<T>;
};

let tracingRuntime: LangfuseTracingRuntime | null = null;

export function loadLangfuseTracing(): LangfuseTracingRuntime {
  if (!tracingRuntime) {
    tracingRuntime = cjsRequire('@langfuse/tracing') as LangfuseTracingRuntime;
  }
  return tracingRuntime;
}

export type LangfuseSpan = LangfuseObservation;
export type LangfuseAgent = LangfuseObservation;
export type LangfuseGeneration = LangfuseObservation;
