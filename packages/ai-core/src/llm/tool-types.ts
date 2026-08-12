import type { LlmUsage } from './types';

export type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type AgentChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };

export type ChatWithToolsInput = {
  model: string;
  messages: AgentChatMessage[];
  tools: ToolDefinition[];
  temperature?: number;
  /** Langfuse generation name override for ReAct iterations */
  tracingGenerationName?: string;
};

export type ChatWithToolsOutput = {
  message: Extract<AgentChatMessage, { role: 'assistant' }>;
  usage: LlmUsage;
};
