import { z } from 'zod';
import { DateTimeSchema, IdSchema } from './_common';

// ============================== WorkoutSet ==============================

export const WorkoutSetSchema = z.object({
  id: IdSchema,
  sessionId: IdSchema,
  exerciseId: IdSchema,
  setIdx: z.number().int().nonnegative().max(50),
  actualReps: z.number().int().nonnegative().max(200),
  actualWeightKg: z.number().nonnegative().max(1000),
  rir: z.number().int().min(0).max(10).nullable().optional(),
  isCompleted: z.boolean().default(false),
});
export type WorkoutSet = z.infer<typeof WorkoutSetSchema>;

export const CreateWorkoutSetSchema = WorkoutSetSchema.omit({
  id: true,
  sessionId: true,
});
export type CreateWorkoutSetInput = z.infer<typeof CreateWorkoutSetSchema>;

export const UpdateWorkoutSetSchema = CreateWorkoutSetSchema.partial();
export type UpdateWorkoutSetInput = z.infer<typeof UpdateWorkoutSetSchema>;

// ============================== WorkoutSession（打卡） ==============================

export const WorkoutSessionSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  plannedDayId: IdSchema.nullable().optional(),
  performedAt: DateTimeSchema,
  durationSec: z.number().int().nonnegative().max(86_400).nullable().optional(),
  mood: z.string().max(32).nullable().optional(),
  note: z.string().max(512).nullable().optional(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema.optional(),
  deletedAt: DateTimeSchema.nullable().optional(),
});
export type WorkoutSession = z.infer<typeof WorkoutSessionSchema>;

/** 客户端提交一次打卡：会话 + 多组 */
export const CreateWorkoutSessionSchema = WorkoutSessionSchema.omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
}).extend({
  sets: z.array(CreateWorkoutSetSchema).min(0).max(200),
});
export type CreateWorkoutSessionInput = z.infer<typeof CreateWorkoutSessionSchema>;

export const UpdateWorkoutSessionSchema = CreateWorkoutSessionSchema.partial();
export type UpdateWorkoutSessionInput = z.infer<typeof UpdateWorkoutSessionSchema>;

export const WorkoutSessionResponseSchema = WorkoutSessionSchema.extend({
  sets: z.array(WorkoutSetSchema),
});
export type WorkoutSessionResponse = z.infer<typeof WorkoutSessionResponseSchema>;
