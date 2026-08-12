import { randomUUID } from 'node:crypto';

import type { ChatWithToolsInput, ChatWithToolsOutput } from './tool-types';
import type { JsonChatInput, JsonChatOutput } from './types';
import type { TextChatInput, TextStreamChunk } from './stream-types';
import type { OpenAiCompatibleJsonClient } from './openai-compatible';
import type { LlmTracingGenerationNames, LlmTracingHooks } from './tracing-types';

const DEFAULT_GENERATION_NAMES: LlmTracingGenerationNames = {
  stream: 'coach-chat-stream',
  json: 'coach-infer-suggested-actions',
  react: 'coach-agent-react',
};

export type CoachChatLlmClient = Pick<
  OpenAiCompatibleJsonClient,
  'streamText' | 'generateJson' | 'chatWithTools'
>;

export function wrapLlmClientWithTracing(
  inner: OpenAiCompatibleJsonClient,
  hooks: LlmTracingHooks,
  generationNames: Partial<LlmTracingGenerationNames> = {},
): CoachChatLlmClient {
  const names: LlmTracingGenerationNames = {
    ...DEFAULT_GENERATION_NAMES,
    ...generationNames,
  };

  const startGeneration = (name: string, model: string, input: unknown): string => {
    if (!hooks.onGenerationStart) {
      return randomUUID();
    }
    try {
      return hooks.onGenerationStart({ name, model, input });
    } catch {
      return randomUUID();
    }
  };

  const endGeneration = (input: {
    generationId: string;
    output?: string;
    usage?: JsonChatOutput['usage'];
    error?: string;
  }): void => {
    if (!hooks.onGenerationEnd || !input.generationId) {
      return;
    }
    try {
      hooks.onGenerationEnd(input);
    } catch {
      // Tracing must not break LLM calls.
    }
  };

  return {
    async *streamText(input: TextChatInput): AsyncIterable<TextStreamChunk> {
      const generationId = startGeneration(names.stream, input.model, input.messages);
      let lastText = '';
      let lastUsage: JsonChatOutput['usage'] | undefined;

      try {
        for await (const chunk of inner.streamText(input)) {
          lastText = chunk.text;
          if (chunk.usage) {
            lastUsage = chunk.usage;
          }
          yield chunk;
        }

        endGeneration({
          generationId,
          output: lastText,
          usage: lastUsage,
        });
      } catch (err: unknown) {
        endGeneration({
          generationId,
          output: lastText || undefined,
          usage: lastUsage,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },

    async generateJson(input: JsonChatInput): Promise<JsonChatOutput> {
      const generationId = startGeneration(names.json, input.model, input.messages);

      try {
        const result = await inner.generateJson(input);
        endGeneration({
          generationId,
          output: result.text,
          usage: result.usage,
        });
        return result;
      } catch (err: unknown) {
        endGeneration({
          generationId,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },

    async chatWithTools(input: ChatWithToolsInput): Promise<ChatWithToolsOutput> {
      const generationName = input.tracingGenerationName ?? names.react;
      const tracingInput = {
        messages: input.messages,
        tools: input.tools.map((tool) => ({
          name: tool.function.name,
          description: tool.function.description,
        })),
      };
      const generationId = startGeneration(generationName, input.model, tracingInput);

      try {
        const result = await inner.chatWithTools(input);
        endGeneration({
          generationId,
          output: JSON.stringify(result.message),
          usage: result.usage,
        });
        return result;
      } catch (err: unknown) {
        endGeneration({
          generationId,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
  };
}
