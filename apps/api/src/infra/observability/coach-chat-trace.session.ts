import {
  createDeepSeekClient,
  type CoachChatLlmClient,
  wrapLlmClientWithTracing,
  type LlmTracingGenerationNames,
} from '@fitness/ai-core';
import type { LlmTracingHooks } from '@fitness/ai-core';
import type { CoachToolName } from '@fitness/shared';

import { forceFlushLangfuse } from '../../instrumentation';
import { traceSessionStorage } from './coach-chat-trace.context';
import {
  loadLangfuseTracing,
  type LangfuseAgent,
  type LangfuseGeneration,
  type LangfuseSpan,
} from './langfuse-tracing.runtime';

export type BeginCoachChatTraceParams = {
  aiRunId: string;
  conversationId: string;
  userId: string;
  model: string;
  coachAgent: boolean;
  userInput: string;
  environment?: string;
  baseUrl: string;
};

type ObservationParent = LangfuseSpan | LangfuseAgent;

const PARENT_SPAN_ID = '0123456789abcdef';

export type CoachChatObservabilityPointer = {
  traceId: string;
  traceUrl?: string;
  generationCount?: number;
  toolSpanCount?: number;
};

export class CoachChatTraceSession {
  private readonly generations = new Map<string, LangfuseGeneration>();
  private langfuseTraceId = '';
  private rootSpan: LangfuseSpan | null = null;
  private agentObservation: LangfuseAgent | null = null;
  private closed = false;
  private generationCount = 0;
  private toolSpanCount = 0;

  constructor(
    private readonly params: BeginCoachChatTraceParams,
    private readonly onWarnFn: (message: string) => void,
  ) {}

  getTraceId(): string {
    return this.langfuseTraceId;
  }

  getTraceUrl(): string {
    const baseUrl = this.params.baseUrl.replace(/\/$/, '');
    return `${baseUrl}/trace/${this.langfuseTraceId}`;
  }

  getObservabilityPointer(): CoachChatObservabilityPointer | null {
    if (!this.langfuseTraceId) {
      return null;
    }

    return {
      traceId: this.langfuseTraceId,
      traceUrl: this.getTraceUrl(),
      generationCount: this.generationCount,
      toolSpanCount: this.toolSpanCount,
    };
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const tracing = loadLangfuseTracing();
    this.langfuseTraceId = await tracing.createTraceId(this.params.aiRunId);

    return tracing.startActiveObservation(
      'COACH_CHAT',
      async (rootSpan) => {
        this.rootSpan = rootSpan;
        rootSpan.update({ input: { message: this.params.userInput } });

        tracing.updateActiveTrace({
          name: 'COACH_CHAT',
          userId: this.params.userId,
          sessionId: this.params.conversationId,
          input: { message: this.params.userInput },
          environment: this.params.environment,
          tags: ['COACH_CHAT', this.params.coachAgent ? 'coach-agent' : 'coach-stream'],
          metadata: {
            taskType: 'COACH_CHAT',
            coachAgent: this.params.coachAgent,
            model: this.params.model,
            aiRunId: this.params.aiRunId,
          },
        });

        if (this.params.coachAgent) {
          this.agentObservation = rootSpan.startObservation(
            'coach-agent',
            { input: { message: this.params.userInput } },
            { asType: 'agent' },
          );
        }

        return traceSessionStorage.run(this, fn);
      },
      {
        parentSpanContext: {
          traceId: this.langfuseTraceId,
          spanId: PARENT_SPAN_ID,
          traceFlags: 1,
        },
      },
    );
  }

  createTracedDeepSeekClient(
    generationNames?: Partial<LlmTracingGenerationNames>,
  ): CoachChatLlmClient {
    return wrapLlmClientWithTracing(
      createDeepSeekClient(),
      this.createTracingHooks(),
      generationNames,
    );
  }

  recordToolSpan(params: {
    name: CoachToolName;
    input: unknown;
    output?: unknown;
    ok: boolean;
    durationMs: number;
  }): void {
    this.toolSpanCount += 1;
    try {
      const tool = this.getObservationParent().startObservation(
        `tool:${params.name}`,
        {
          input: params.input,
          metadata: {
            ok: params.ok,
            durationMs: params.durationMs,
          },
        },
        { asType: 'tool' },
      );

      tool
        .update({
          output: params.output,
          level: params.ok ? 'DEFAULT' : 'ERROR',
          metadata: {
            ok: params.ok,
            durationMs: params.durationMs,
          },
        })
        .end();
    } catch (err: unknown) {
      this.warn(`Langfuse tool span 上报失败: ${this.formatError(err)}`);
    }
  }

  complete(params?: { output?: string }): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      if (this.agentObservation) {
        this.agentObservation.update({ output: params?.output }).end();
        this.agentObservation = null;
      }
      this.rootSpan?.update({ output: params?.output });
      this.rootSpan?.updateTrace({ output: params?.output });
    } catch (err: unknown) {
      this.warn(`Langfuse trace 完成更新失败: ${this.formatError(err)}`);
    }
  }

  fail(error: string): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      if (this.agentObservation) {
        this.agentObservation
          .update({
            output: { error },
            level: 'ERROR',
          })
          .end();
        this.agentObservation = null;
      }
      this.rootSpan?.update({
        output: { error },
        level: 'ERROR',
      });
      this.rootSpan?.updateTrace({
        output: { error },
        metadata: { failed: true },
      });
    } catch (err: unknown) {
      this.warn(`Langfuse trace 失败更新失败: ${this.formatError(err)}`);
    }
  }

  flushAsync(): Promise<void> {
    return forceFlushLangfuse().catch((err: unknown) => {
      this.warn(`Langfuse flush 失败: ${this.formatError(err)}`);
    });
  }

  private getObservationParent(): ObservationParent {
    return this.agentObservation ?? this.rootSpan!;
  }

  private createTracingHooks(): LlmTracingHooks {
    return {
      onGenerationStart: (input) => {
        this.generationCount += 1;
        const generation = this.getObservationParent().startObservation(
          input.name,
          {
            model: input.model,
            input: input.input,
          },
          { asType: 'generation' },
        );
        this.generations.set(generation.id, generation);
        return generation.id;
      },
      onGenerationEnd: (input) => {
        const generation = this.generations.get(input.generationId);
        if (!generation) {
          return;
        }
        generation
          .update({
            output: input.error ? { error: input.error } : input.output,
            level: input.error ? 'ERROR' : 'DEFAULT',
            usageDetails: input.usage
              ? {
                  input: input.usage.tokenIn,
                  output: input.usage.tokenOut,
                }
              : undefined,
          })
          .end();
        this.generations.delete(input.generationId);
      },
    };
  }

  private warn(message: string): void {
    this.onWarnFn(message);
  }

  private formatError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}

export function createCoachChatTraceSession(
  params: BeginCoachChatTraceParams,
  onWarn: (message: string) => void,
): CoachChatTraceSession {
  return new CoachChatTraceSession(params, onWarn);
}
