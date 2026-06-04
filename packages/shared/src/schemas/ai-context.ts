import { z } from 'zod';
import { ProfileSchema, StrengthLevelSchema } from './user';
import { NutritionDailySummarySchema } from './nutrition';

/** Worker 注入的 AI 用户上下文快照 */
export const UserAiContextSchema = z.object({
  profile: ProfileSchema.nullable(),
  strengthLevels: z.array(StrengthLevelSchema),
  activeWorkoutPlan: z
    .object({
      id: z.string().min(8).max(64),
      summary: z.string().max(512),
    })
    .nullable()
    .optional(),
  activeMealPlan: z
    .object({
      id: z.string().min(8).max(64),
      summary: z.string().max(512),
    })
    .nullable()
    .optional(),
  todayNutrition: NutritionDailySummarySchema.nullable().optional(),
});
export type UserAiContext = z.infer<typeof UserAiContextSchema>;

export const PlanGeneratorUserContextSchema = z.object({
  activeWorkoutPlanSummary: z.string().max(512).optional(),
  activeMealPlanSummary: z.string().max(512).optional(),
  todayNutrition: NutritionDailySummarySchema.optional(),
});
export type PlanGeneratorUserContext = z.infer<typeof PlanGeneratorUserContextSchema>;
