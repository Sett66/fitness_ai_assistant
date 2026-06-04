import { z } from 'zod';
import { MealTypeSchema, PlanStatusSchema, PlanTypeSchema, WorkoutSplitTypeSchema } from '../enums';
import { DateTimeSchema, IdSchema, MacrosSchema } from './_common';

// ============================== Plan ==============================

export const PlanSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  type: PlanTypeSchema,
  mesocycleWeeks: z.number().int().min(1).max(16).default(4),
  startDate: DateTimeSchema,
  endDate: DateTimeSchema,
  status: PlanStatusSchema,
  aiRunId: IdSchema.nullable().optional(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema.optional(),
  deletedAt: DateTimeSchema.nullable().optional(),
});
export type Plan = z.infer<typeof PlanSchema>;

// ============================== WorkoutPlan 嵌套 ==============================

export const WorkoutPlanItemSchema = z.object({
  id: IdSchema,
  workoutPlanDayId: IdSchema,
  exerciseId: IdSchema,
  plannedSets: z.number().int().min(1).max(30),
  plannedReps: z.number().int().min(1).max(100),
  plannedWeightKg: z.number().nonnegative().max(1000).nullable().optional(),
  plannedRestSec: z.number().int().nonnegative().max(3600).default(90),
  notes: z.string().max(256).nullable().optional(),
});
export type WorkoutPlanItem = z.infer<typeof WorkoutPlanItemSchema>;

/** GET 详情时 join Exercise.nameZh */
export const WorkoutPlanItemResponseSchema = WorkoutPlanItemSchema.extend({
  exerciseName: z.string().min(1).max(64).optional(),
});
export type WorkoutPlanItemResponse = z.infer<typeof WorkoutPlanItemResponseSchema>;

export const WorkoutPlanDaySchema = z.object({
  id: IdSchema,
  planId: IdSchema,
  weekIdx: z.number().int().min(0).max(15),
  dayIdx: z.number().int().min(0).max(6),
  title: z.string().min(1).max(64),
  restDay: z.boolean(),
  items: z.array(WorkoutPlanItemSchema).optional(),
});
export type WorkoutPlanDay = z.infer<typeof WorkoutPlanDaySchema>;

export const WorkoutPlanDayResponseSchema = WorkoutPlanDaySchema.extend({
  items: z.array(WorkoutPlanItemResponseSchema).optional(),
});
export type WorkoutPlanDayResponse = z.infer<typeof WorkoutPlanDayResponseSchema>;

export const UpdateWorkoutPlanItemSchema = z.object({
  exerciseId: IdSchema.optional(),
  plannedSets: z.number().int().min(1).max(30).optional(),
  plannedReps: z.number().int().min(1).max(100).optional(),
  plannedWeightKg: z.number().nonnegative().max(1000).nullable().optional(),
  plannedRestSec: z.number().int().nonnegative().max(3600).optional(),
  notes: z.string().max(256).nullable().optional(),
});
export type UpdateWorkoutPlanItemInput = z.infer<typeof UpdateWorkoutPlanItemSchema>;

// ============================== MealPlan 嵌套 ==============================

/** 单条食材项（plan 内嵌引用） */
export const MealPlanIngredientSchema = z.object({
  foodId: IdSchema.nullable().optional(),
  dishName: z.string().min(1).max(64).optional(),
  grams: z.number().nonnegative().max(5000),
});
export type MealPlanIngredient = z.infer<typeof MealPlanIngredientSchema>;

export const MealPlanItemSchema = z.object({
  id: IdSchema,
  mealPlanDayId: IdSchema,
  meal: MealTypeSchema,
  dishName: z.string().min(1).max(64),
  ingredients: z.array(MealPlanIngredientSchema).max(50),
  cookingMethod: z.string().max(512).nullable().optional(),
  kcal: z.number().nonnegative().max(10_000),
  macros: MacrosSchema,
});
export type MealPlanItem = z.infer<typeof MealPlanItemSchema>;

export const MealPlanDaySchema = z.object({
  id: IdSchema,
  planId: IdSchema,
  weekIdx: z.number().int().min(0).max(15),
  dayIdx: z.number().int().min(0).max(6),
  totalKcal: z.number().nonnegative().max(20_000),
  macros: MacrosSchema,
  items: z.array(MealPlanItemSchema).optional(),
});
export type MealPlanDay = z.infer<typeof MealPlanDaySchema>;

// ============================== 计划生成偏好 ==============================

export const WorkoutPlanPreferencesSchema = z.object({
  splitType: WorkoutSplitTypeSchema.optional(),
  daysPerWeek: z.number().int().min(2).max(6).optional(),
  includeCardio: z.boolean().default(false),
});
export type WorkoutPlanPreferences = z.infer<typeof WorkoutPlanPreferencesSchema>;

// ============================== 计划生成入口 ==============================

export const GeneratePlanRequestSchema = z.object({
  type: PlanTypeSchema,
  mesocycleWeeks: z.number().int().min(1).max(16).default(4),
  startDate: DateTimeSchema.optional(),
  notes: z.string().max(512).optional(),
  preferences: WorkoutPlanPreferencesSchema.optional(),
});
export type GeneratePlanRequest = z.infer<typeof GeneratePlanRequestSchema>;

// ============================== Plan 响应 ==============================

export const PlanResponseSchema = PlanSchema.extend({
  workoutDays: z.array(WorkoutPlanDayResponseSchema).optional(),
  mealDays: z.array(MealPlanDaySchema).optional(),
});
export type PlanResponse = z.infer<typeof PlanResponseSchema>;

// ============================== Create/Update（多数情况由 AI 写入，手动入口仅留兜底） ==============================

export const CreatePlanSchema = PlanSchema.omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  aiRunId: true,
});
export type CreatePlanInput = z.infer<typeof CreatePlanSchema>;

export const UpdatePlanSchema = CreatePlanSchema.partial();
export type UpdatePlanInput = z.infer<typeof UpdatePlanSchema>;
