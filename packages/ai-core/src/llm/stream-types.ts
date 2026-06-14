import type { AgentChatMessage } from './tool-types';
import type { ChatMessage, JsonChatInput, JsonChatOutput, LlmUsage } from './types';

export type TextChatInput = {
  model: string;
  messages: AgentChatMessage[] | ChatMessage[];
  temperature?: number;
};

export type TextStreamChunk = {
  delta: string;
  text: string;
  usage?: LlmUsage;
};

export type TextChatClient = {
  streamText(input: TextChatInput): AsyncIterable<TextStreamChunk>;
  generateJson(input: JsonChatInput): Promise<JsonChatOutput>;
};
