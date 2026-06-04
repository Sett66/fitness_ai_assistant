import { z } from 'zod';
import { AiTaskStatusSchema, AiTaskTypeSchema, LlmModelSchema } from '../enums';
import { DateTimeSchema, IdSchema } from './_common';

// ============================== AiRun ==============================

export const AiRunSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  taskType: AiTaskTypeSchema,
  model: LlmModelSchema,
  status: AiTaskStatusSchema,
  inputJson: z.unknown(),
  outputJson: z.unknown().nullable().optional(),
  errorMsg: z.string().max(2048).nullable().optional(),
  tokenIn: z.number().int().nonnegative().default(0),
  tokenOut: z.number().int().nonnegative().default(0),
  costCny: z.number().nonnegative().default(0),
  durationMs: z.number().int().nonnegative().default(0),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema.optional(),
});
export type AiRun = z.infer<typeof AiRunSchema>;

/** 仅 worker / 内部 service 调用，HTTP 不直接暴露 */
export const CreateAiRunSchema = z.object({
  taskType: AiTaskTypeSchema,
  model: LlmModelSchema,
  inputJson: z.unknown(),
});
export type CreateAiRunInput = z.infer<typeof CreateAiRunSchema>;

/** worker 跑完更新结果用 */
export const UpdateAiRunSchema = z
  .object({
    status: AiTaskStatusSchema,
    outputJson: z.unknown(),
    errorMsg: z.string().max(2048),
    tokenIn: z.number().int().nonnegative(),
    tokenOut: z.number().int().nonnegative(),
    costCny: z.number().nonnegative(),
    durationMs: z.number().int().nonnegative(),
  })
  .partial();
export type UpdateAiRunInput = z.infer<typeof UpdateAiRunSchema>;

export const AiRunResponseSchema = AiRunSchema;
export type AiRunResponse = z.infer<typeof AiRunResponseSchema>;

// ============================== HTTP 任务投递 / 状态查询 ==============================

/** POST /v1/plans/generate 等任务投递接口的通用响应（ARCH §5） */
export const AiTaskAcceptedResponseSchema = z.object({
  taskId: IdSchema,
});
export type AiTaskAcceptedResponse = z.infer<typeof AiTaskAcceptedResponseSchema>;

/** GET /v1/ai/tasks/:taskId */
export const AiTaskStatusResponseSchema = z.object({
  taskId: IdSchema,
  status: AiTaskStatusSchema,
  taskType: AiTaskTypeSchema,
  result: z.unknown().nullable().optional(),
  errorMsg: z.string().nullable().optional(),
});
export type AiTaskStatusResponse = z.infer<typeof AiTaskStatusResponseSchema>;
