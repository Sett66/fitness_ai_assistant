import { z } from 'zod';
import { MealVisionAdviceSchema, NutritionDailySummarySchema } from '@fitness/shared';
import { MealTypeSchema } from '@fitness/shared/enums';
import { MealVisionResultSchema } from '@fitness/shared/schemas';

export const RunMealVisionAdviceInputSchema = z.object({
  items: MealVisionResultSchema.shape.items,
  nutritionContext: NutritionDailySummarySchema,
  mealType: MealTypeSchema.optional(),
  notes: z.string().max(512).optional(),
});

export type RunMealVisionAdviceInput = z.infer<typeof RunMealVisionAdviceInputSchema>;

export const MealVisionAdviceOutputSchema = MealVisionAdviceSchema;
export type MealVisionAdviceOutput = z.infer<typeof MealVisionAdviceOutputSchema>;
