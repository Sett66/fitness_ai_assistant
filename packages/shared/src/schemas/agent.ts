import { z } from 'zod';

/** 移动端附带的 LBS 上下文（ADR 0008 §4.1） */
export const LocationContextSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().optional(),
  city: z.string().max(64).optional(),
  capturedAt: z.string().datetime(),
});
export type LocationContext = z.infer<typeof LocationContextSchema>;

/** Coach Agent 工具名，与 ADR 0008 §2 工具表逐字一致 */
export const CoachToolNameSchema = z.enum([
  'get_user_fitness_snapshot',
  'get_weather',
  'geocode_place',
  'search_nearby_gyms',
  'enqueue_plan_generate',
  'enqueue_meal_vision',
]);
export type CoachToolName = z.infer<typeof CoachToolNameSchema>;

/** 单轮工具调用审计摘要（持久化于 AiRun.outputJson / Message.metadata） */
export const CoachToolTraceItemSchema = z.object({
  name: CoachToolNameSchema,
  inputSummary: z.string().max(256).optional(),
  outputSummary: z.string().max(512).optional(),
  durationMs: z.number().nonnegative(),
  ok: z.boolean(),
});
export type CoachToolTraceItem = z.infer<typeof CoachToolTraceItemSchema>;

/** 长期记忆事实（读取 / 注入 prompt） */
export const AgentMemoryFactSchema = z.object({
  key: z.string().max(64),
  value: z.string().max(512),
  confidence: z.number().min(0).max(1).optional(),
});
export type AgentMemoryFact = z.infer<typeof AgentMemoryFactSchema>;

/** 长期记忆变更（抽取 job 输出：新增、更新或删除） */
export const AgentMemoryPatchSchema = z
  .object({
    key: z.string().max(64),
    action: z.enum(['upsert', 'remove']),
    value: z.string().max(512).optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .superRefine((patch, ctx) => {
    if (patch.action === 'upsert' && !patch.value?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'upsert 必须提供 value',
        path: ['value'],
      });
    }
  });
export type AgentMemoryPatch = z.infer<typeof AgentMemoryPatchSchema>;

export const CoachStreamToolStartEventSchema = z.object({
  name: CoachToolNameSchema,
  label: z.string().max(64).optional(),
});
export type CoachStreamToolStartEvent = z.infer<typeof CoachStreamToolStartEventSchema>;

export const CoachStreamToolEndEventSchema = z.object({
  name: CoachToolNameSchema,
  ok: z.boolean(),
  summary: z.string().max(512).optional(),
});
export type CoachStreamToolEndEvent = z.infer<typeof CoachStreamToolEndEventSchema>;
