import { z } from 'zod';
import { ExerciseDifficultySchema, GoalSchema } from '../../enums';
import { DateTimeSchema, IdSchema } from '../_common';

/**
 * Phase 2 占位 schema —— 训练伙伴匹配（基于地理位置）。
 * 仅用于在 packages/db 中建表，MVP 不开放对外 API。
 */
export const PartnerProfileSchema = z.object({
  userId: IdSchema,
  city: z.string().min(1).max(64),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  goal: GoalSchema,
  level: ExerciseDifficultySchema,
  bio: z.string().max(512).nullable().optional(),
  updatedAt: DateTimeSchema.optional(),
});
export type PartnerProfile = z.infer<typeof PartnerProfileSchema>;
