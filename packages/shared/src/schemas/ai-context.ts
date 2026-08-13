import { z } from 'zod';
import { HEALTH_CONTEXT_MAX_CHARS } from '../constants/health-report';
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
  /** 最近一份新鲜 DONE 报告的健康约束摘要；无则省略 */
  healthContext: z.string().max(HEALTH_CONTEXT_MAX_CHARS).optional(),
});
export type UserAiContext = z.infer<typeof UserAiContextSchema>;

export const PlanGeneratorUserContextSchema = z.object({
  activeWorkoutPlanSummary: z.string().max(512).optional(),
  activeMealPlanSummary: z.string().max(512).optional(),
  todayNutrition: NutritionDailySummarySchema.optional(),
});
export type PlanGeneratorUserContext = z.infer<typeof PlanGeneratorUserContextSchema>;
