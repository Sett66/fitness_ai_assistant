import {
  createDeepSeekClient,
  type CoachChatLlmClient,
  wrapLlmClientWithTracing,
} from '@fitness/ai-core';
import type { LlmTracingHooks } from '@fitness/ai-core';
import { randomUUID } from 'node:crypto';

import type { Langfuse, LangfuseGenerationClient, LangfuseTraceClient } from 'langfuse';

export type BeginCoachChatTraceParams = {
  aiRunId: string;
  conversationId: string;
  userId: string;
  model: string;
  coachAgent: boolean;
};

export class CoachChatTraceSession {
  private readonly generations = new Map<string, LangfuseGenerationClient>();
  private closed = false;

  constructor(
    private readonly trace: LangfuseTraceClient,
    private readonly langfuse: Langfuse,
    private readonly onWarn: (message: string) => void,
  ) {}

  createTracedDeepSeekClient(): CoachChatLlmClient {
    return wrapLlmClientWithTracing(createDeepSeekClient(), this.createTracingHooks());
  }

  complete(params?: { output?: string }): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      this.trace.update({
        output: params?.output,
      });
    } catch (err: unknown) {
      this.onWarn(`Langfuse trace 完成更新失败: ${this.formatError(err)}`);
    }
  }

  fail(error: string): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      this.trace.update({
        output: { error },
        metadata: { failed: true },
      });
    } catch (err: unknown) {
      this.onWarn(`Langfuse trace 失败更新失败: ${this.formatError(err)}`);
    }
  }

  flushAsync(): Promise<void> {
    return this.langfuse.flushAsync().catch((err: unknown) => {
      this.onWarn(`Langfuse flush 失败: ${this.formatError(err)}`);
    });
  }

  private createTracingHooks(): LlmTracingHooks {
    return {
      onGenerationStart: (input) => {
        const generationId = randomUUID();
        const generation = this.trace.generation({
          id: generationId,
          name: input.name,
          model: input.model,
          input: input.messages,
        });
        this.generations.set(generationId, generation);
        return generationId;
      },
      onGenerationEnd: (input) => {
        const generation = this.generations.get(input.generationId);
        if (!generation) {
          return;
        }
        generation.end({
          output: input.error ? { error: input.error } : input.output,
          level: input.error ? 'ERROR' : 'DEFAULT',
          usage: input.usage
            ? {
                input: input.usage.tokenIn,
                output: input.usage.tokenOut,
              }
            : undefined,
        });
        this.generations.delete(input.generationId);
      },
    };
  }

  private formatError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}

export function createCoachChatTraceSession(
  langfuse: Langfuse,
  params: BeginCoachChatTraceParams,
  onWarn: (message: string) => void,
): CoachChatTraceSession {
  const trace = langfuse.trace({
    id: params.aiRunId,
    name: 'COACH_CHAT',
    userId: params.userId,
    sessionId: params.conversationId,
    metadata: {
      taskType: 'COACH_CHAT',
      coachAgent: params.coachAgent,
      model: params.model,
    },
    tags: ['COACH_CHAT', params.coachAgent ? 'coach-agent' : 'coach-stream'],
  });

  return new CoachChatTraceSession(trace, langfuse, onWarn);
}
