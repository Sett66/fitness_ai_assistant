import { z } from 'zod';

/** 计划类型 —— 训练 / 饮食 */
export const PLAN_TYPE_VALUES = ['WORKOUT', 'MEAL'] as const;
export const PlanTypeSchema = z.enum(PLAN_TYPE_VALUES);
export type PlanType = z.infer<typeof PlanTypeSchema>;

/** 计划状态 */
export const PLAN_STATUS_VALUES = [
  'PENDING',
  'GENERATING',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
] as const;
export const PlanStatusSchema = z.enum(PLAN_STATUS_VALUES);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

/** 餐次 */
export const MEAL_TYPE_VALUES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;
export const MealTypeSchema = z.enum(MEAL_TYPE_VALUES);
export type MealType = z.infer<typeof MealTypeSchema>;
