export { AiCoreError } from './errors';
export { runMealVision, runMealVisionWithAdvice } from './chains/meal-vision';
export type { MealVisionOutput } from './chains/meal-vision';
export { runReportExtract } from './chains/report-extract';
export type { ReportExtractOutput } from './chains/report-extract';
export { runMealVisionAdvice, mergeLlmUsage } from './chains/meal-vision/advice';
export { describeCoachImages, buildAugmentedUserText } from './chains/coach-image-describe';
export type { DescribeCoachImagesResult } from './chains/coach-image-describe';
export { createDeepSeekClient } from './llm/deepseek';
export { createJsonClientForModel } from './llm/factory';
export { createQwenVlClient } from './llm/qwen-vl';
export type { CoachChatLlmClient } from './llm/tracing-client';
export { wrapLlmClientWithTracing } from './llm/tracing-client';
export type {
  LlmGenerationEndInput,
  LlmGenerationStartInput,
  LlmTracingHooks,
} from './llm/tracing-types';
export type { JsonChatClient, JsonChatOutput, LlmUsage } from './llm/types';
export { parseJsonWithSchema } from './parsers/json-zod';
export { runMealPlanGenerator, runWorkoutPlanGenerator } from './graphs/plan-generator';
export { runCoachChat } from './chains/coach-chat';
export { runCoachChatStream } from './chains/coach-chat/stream';
export { inferSuggestedActions } from './chains/coach-chat/infer-suggested-actions';
export { buildCoachSystemPrompt } from './chains/coach-chat/build-system-prompt';
export {
  createCoachAgentGraph,
  runCoachAgentStream,
  MAX_TOOL_ITERATIONS,
} from './graphs/coach-agent';
export type {
  CoachAgentRunnerEvent,
  CoachAgentStreamDoneEvent,
  CreateCoachAgentGraphOptions,
  InvokeToolFn,
  RunCoachAgentStreamInput,
  RunCoachAgentStreamOptions,
} from './graphs/coach-agent';
export { formatMemoryBlock } from './memory/format-memory-block';
export { extractMemoryFacts } from './memory/extract-memory-facts';
export type {
  ExtractMemoryFactsInput,
  ExtractMemoryFactsResult,
} from './memory/extract-memory-facts';
export type { AgentMemoryPatch } from '@fitness/shared';
export type { BuildCoachSystemPromptInput } from './chains/coach-chat/build-system-prompt';
export type { CoachChatOutput, RunCoachChatInput } from './chains/coach-chat';
export type { CoachChatStreamChunk, CoachChatStreamResult } from './chains/coach-chat/stream';
export type {
  GeneratedMealPlan,
  GeneratedWorkoutPlan,
  PlanGeneratorOutput,
} from './graphs/plan-generator';
