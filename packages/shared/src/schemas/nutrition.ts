import { z } from 'zod';
import { ItemSourceTagSchema, MealLogSourceSchema, MealTypeSchema } from '../enums';
import { DateTimeSchema, IdSchema, MacrosSchema } from './_common';

// ============================== MealLogItem ==============================

export const MealLogItemSchema = z.object({
  id: IdSchema,
  mealLogId: IdSchema,
  foodId: IdSchema.nullable().optional(),
  dishName: z.string().min(1).max(64),
  grams: z.number().nonnegative().max(5000),
  kcal: z.number().nonnegative().max(10_000),
  macros: MacrosSchema,
  sourceTag: ItemSourceTagSchema,
});
export type MealLogItem = z.infer<typeof MealLogItemSchema>;

export const CreateMealLogItemSchema = MealLogItemSchema.omit({
  id: true,
  mealLogId: true,
});
export type CreateMealLogItemInput = z.infer<typeof CreateMealLogItemSchema>;

// ============================== MealLog ==============================

export const MealLogSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  takenAt: DateTimeSchema,
  mealType: MealTypeSchema,
  source: MealLogSourceSchema,
  imageMediaId: IdSchema.nullable().optional(),
  totalKcal: z.number().nonnegative().max(20_000),
  macros: MacrosSchema,
  items: z.array(MealLogItemSchema).optional(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema.optional(),
  deletedAt: DateTimeSchema.nullable().optional(),
});
export type MealLog = z.infer<typeof MealLogSchema>;

export const CreateMealLogSchema = MealLogSchema.omit({
  id: true,
  userId: true,
  items: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
}).extend({
  items: z.array(CreateMealLogItemSchema).min(1).max(50),
});
export type CreateMealLogInput = z.infer<typeof CreateMealLogSchema>;

export const UpdateMealLogSchema = CreateMealLogSchema.partial();
export type UpdateMealLogInput = z.infer<typeof UpdateMealLogSchema>;

export const MealLogResponseSchema = MealLogSchema;
export type MealLogResponse = z.infer<typeof MealLogResponseSchema>;

// ============================== VLM 识别结果（AI 输出 zod 校验目标） ==============================

/**
 * Qwen-VL 食物识别返回结构（PRD §3.1 F5、ARCH §5）。
 * worker 端用这个 schema 解析 LLM 返回，失败则任务标 AI_TASK_PARSE_FAILED。
 */
/** 当日营养摄入快照（服务端计算，供餐照建议与客户端展示） */
export const NutritionDailySummarySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetKcal: z.number().nonnegative().max(20_000),
  targetMacros: MacrosSchema,
  consumedKcal: z.number().nonnegative().max(20_000),
  consumedMacros: MacrosSchema,
  remainingKcal: z.number(),
  mealsLoggedToday: z.array(MealTypeSchema),
  pendingMeals: z.array(MealTypeSchema),
});
export type NutritionDailySummary = z.infer<typeof NutritionDailySummarySchema>;

/** 餐照识别后的营养师式建议（DeepSeek 二阶段输出） */
export const MealVisionAdviceSchema = z.object({
  summary: z.string().min(1).max(2000),
  mealImpact: z.string().min(1).max(1024),
  dinnerSuggestion: z.string().max(1024).optional(),
});
export type MealVisionAdvice = z.infer<typeof MealVisionAdviceSchema>;

export const MealVisionResultSchema = z.object({
  items: z
    .array(
      z.object({
        dishName: z.string().min(1).max(64),
        grams: z.number().positive().max(5000),
        kcal: z.number().nonnegative().max(10_000),
        macros: MacrosSchema,
        confidence: z.number().min(0).max(1).optional(),
      }),
    )
    .min(1)
    .max(10),
  nutritionContext: NutritionDailySummarySchema.optional(),
  advice: MealVisionAdviceSchema.optional(),
  mealLogId: IdSchema.optional(),
});
export type MealVisionResult = z.infer<typeof MealVisionResultSchema>;

/** MEAL_VISION 任务 inputJson（HTTP 投递） */
export const MealVisionTaskInputSchema = z
  .object({
    imageUrl: z.string().url().optional(),
    objectKey: z.string().min(1).max(512).optional(),
    imageMediaId: IdSchema.optional(),
    notes: z.string().max(512).optional(),
    mealType: MealTypeSchema.optional(),
    saveMealLog: z.boolean().default(true),
    timezoneOffsetMinutes: z.number().int().min(-720).max(840).default(480),
  })
  .refine((v) => Boolean(v.imageUrl || v.objectKey), {
    message: 'imageUrl 或 objectKey 至少提供一个',
  });
export type MealVisionTaskInput = z.infer<typeof MealVisionTaskInputSchema>;
