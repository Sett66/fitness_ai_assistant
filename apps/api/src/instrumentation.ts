import { createRequire } from 'node:module';

const cjsRequire = createRequire(__filename);

type LangfuseSpanProcessor = {
  forceFlush: () => Promise<void>;
};

type NodeSdk = {
  start: () => void;
};

let sdk: NodeSdk | null = null;
let spanProcessor: LangfuseSpanProcessor | null = null;
let initPromise: Promise<void> | null = null;

async function ensureLangfuseInstrumentation(): Promise<void> {
  if (sdk) {
    return;
  }

  if (process.env.LANGFUSE_ENABLED !== 'true') {
    return;
  }

  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return;
  }

  if (!process.env.LANGFUSE_TRACING_ENVIRONMENT) {
    process.env.LANGFUSE_TRACING_ENVIRONMENT = process.env.NODE_ENV ?? 'development';
  }

  const { LangfuseSpanProcessor } = cjsRequire('@langfuse/otel') as {
    LangfuseSpanProcessor: new () => LangfuseSpanProcessor;
  };
  const { NodeSDK } = cjsRequire('@opentelemetry/sdk-node') as {
    NodeSDK: new (config: { spanProcessors: LangfuseSpanProcessor[] }) => NodeSdk;
  };

  spanProcessor = new LangfuseSpanProcessor();
  sdk = new NodeSDK({
    spanProcessors: [spanProcessor],
  });
  sdk.start();
}

export function initLangfuseInstrumentation(): void {
  if (!initPromise) {
    initPromise = ensureLangfuseInstrumentation();
  }
}

export async function forceFlushLangfuse(): Promise<void> {
  await initPromise;
  await spanProcessor?.forceFlush();
}
