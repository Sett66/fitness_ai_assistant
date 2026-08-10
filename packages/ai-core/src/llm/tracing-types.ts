import type { LlmUsage } from './types';

export type LlmGenerationStartInput = {
  name: string;
  model: string;
  messages: unknown[];
};

export type LlmGenerationEndInput = {
  generationId: string;
  output?: string;
  usage?: LlmUsage;
  error?: string;
};

export type LlmTracingHooks = {
  onGenerationStart?: (input: LlmGenerationStartInput) => string;
  onGenerationEnd?: (input: LlmGenerationEndInput) => void;
};

export type LlmTracingGenerationNames = {
  stream: string;
  json: string;
};
