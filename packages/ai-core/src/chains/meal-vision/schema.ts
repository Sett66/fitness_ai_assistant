import { z } from 'zod';
import { NutritionDailySummarySchema } from '@fitness/shared/schemas';
import { MealTypeSchema } from '@fitness/shared/enums';

const VisionImageUrlSchema = z.string().refine(
  (value) => {
    if (value.startsWith('data:image/')) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  },
  { message: 'imageUrl must be http(s) or data:image URL' },
);

export const RunMealVisionInputSchema = z.object({
  imageUrl: VisionImageUrlSchema,
  notes: z.string().max(512).optional(),
  nutritionContext: NutritionDailySummarySchema.optional(),
  mealType: MealTypeSchema.optional(),
});
export type RunMealVisionInput = z.infer<typeof RunMealVisionInputSchema>;

export const MealVisionItemsOnlySchema = z.object({
  items: z
    .array(
      z.object({
        dishName: z.string().min(1).max(64),
        grams: z.number().positive().max(5000),
        kcal: z.number().nonnegative().max(10_000),
        macros: z.object({
          protein: z.number().nonnegative(),
          carbs: z.number().nonnegative(),
          fat: z.number().nonnegative(),
        }),
        confidence: z.number().min(0).max(1).optional(),
      }),
    )
    .min(1)
    .max(10),
});
