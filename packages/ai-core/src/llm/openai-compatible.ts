import { AiCoreError } from '../errors';
import type { JsonChatClient, JsonChatInput, JsonChatOutput, LlmUsage } from './types';
import type { TextChatInput, TextStreamChunk } from './stream-types';

type OpenAiCompatibleOptions = {
  providerName: string;
  apiKey?: string;
  baseUrl: string;
  defaultModel: string;
  inputTokenCnyPer1K?: number;
  outputTokenCnyPer1K?: number;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: { message?: string };
};

type StreamCompletionChunk = {
  choices?: Array<{ delta?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: { message?: string };
};

export class OpenAiCompatibleJsonClient implements JsonChatClient {
  constructor(private readonly options: OpenAiCompatibleOptions) {}

  async generateJson(input: JsonChatInput): Promise<JsonChatOutput> {
    if (!this.options.apiKey) {
      throw new AiCoreError(
        'AI_CORE_MISSING_API_KEY',
        `${this.options.providerName} API Key 未配置`,
      );
    }

    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model || this.options.defaultModel,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
    if (!response.ok) {
      throw new AiCoreError(
        'AI_CORE_PROVIDER_ERROR',
        `${this.options.providerName} 调用失败：${payload.error?.message ?? response.statusText}`,
        payload,
      );
    }

    const text = payload.choices?.[0]?.message?.content;
    if (!text) {
      throw new AiCoreError('AI_CORE_PROVIDER_ERROR', `${this.options.providerName} 返回内容为空`);
    }

    return {
      text,
      usage: this.toUsage(payload),
    };
  }

  async *streamText(input: TextChatInput): AsyncIterable<TextStreamChunk> {
    if (!this.options.apiKey) {
      throw new AiCoreError(
        'AI_CORE_MISSING_API_KEY',
        `${this.options.providerName} API Key 未配置`,
      );
    }

    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model || this.options.defaultModel,
        messages: input.messages,
        temperature: input.temperature ?? 0.7,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
      throw new AiCoreError(
        'AI_CORE_PROVIDER_ERROR',
        `${this.options.providerName} 流式调用失败：${payload.error?.message ?? response.statusText}`,
        payload,
      );
    }

    if (!response.body) {
      throw new AiCoreError('AI_CORE_PROVIDER_ERROR', `${this.options.providerName} 流式响应为空`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let usage: LlmUsage | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) {
          continue;
        }
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') {
          continue;
        }

        let payload: StreamCompletionChunk;
        try {
          payload = JSON.parse(data) as StreamCompletionChunk;
        } catch {
          continue;
        }

        if (payload.usage) {
          usage = this.toUsage(payload);
        }

        const delta = payload.choices?.[0]?.delta?.content ?? '';
        if (!delta) {
          continue;
        }

        text += delta;
        yield { delta, text, usage };
      }
    }

    if (text.length === 0) {
      throw new AiCoreError(
        'AI_CORE_PROVIDER_ERROR',
        `${this.options.providerName} 流式返回内容为空`,
      );
    }

    if (!usage) {
      yield { delta: '', text, usage: { tokenIn: 0, tokenOut: 0, costCny: 0 } };
    }
  }

  private toUsage(payload: ChatCompletionResponse | StreamCompletionChunk): LlmUsage {
    const tokenIn = payload.usage?.prompt_tokens ?? 0;
    const tokenOut = payload.usage?.completion_tokens ?? 0;
    const inputCost = (tokenIn / 1000) * (this.options.inputTokenCnyPer1K ?? 0);
    const outputCost = (tokenOut / 1000) * (this.options.outputTokenCnyPer1K ?? 0);
    return {
      tokenIn,
      tokenOut,
      costCny: Number((inputCost + outputCost).toFixed(4)),
    };
  }
}
