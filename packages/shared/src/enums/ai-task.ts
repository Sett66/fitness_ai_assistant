import { z } from 'zod';

/** AI 任务类型（PRD §5.3、ARCH §5） */
export const AI_TASK_TYPE_VALUES = [
  'PLAN_GENERATE_WORKOUT',
  'PLAN_GENERATE_MEAL',
  'MEAL_VISION',
  'COACH_CHAT',
  'MESOCYCLE_REVIEW',
  'REPORT_ANALYZE',
] as const;
export const AiTaskTypeSchema = z.enum(AI_TASK_TYPE_VALUES);
export type AiTaskType = z.infer<typeof AiTaskTypeSchema>;

/** AI 任务状态（ARCH §5 异步链路） */
export const AI_TASK_STATUS_VALUES = ['QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED'] as const;
export const AiTaskStatusSchema = z.enum(AI_TASK_STATUS_VALUES);
export type AiTaskStatus = z.infer<typeof AiTaskStatusSchema>;

/**
 * LLM 模型 ID。
 * 字符串自由形式，避免每次更新模型版本都改 enum；
 * 受 constants/ai-task 中的 ALLOWED_LLM_MODELS 引导。
 */
export const LlmModelSchema = z.string().min(1).max(64);
export type LlmModel = z.infer<typeof LlmModelSchema>;
