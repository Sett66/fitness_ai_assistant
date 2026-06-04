import { z } from 'zod';
import { MealTypeSchema, PlanTypeSchema, WorkoutPlanPreferencesSchema } from '@fitness/shared';
import { PlanGeneratorUserContextSchema } from '@fitness/shared/schemas';
import { MacrosSchema } from '@fitness/shared/schemas';

const PlanGeneratorBaseInputSchema = z.object({
  type: PlanTypeSchema.optional(),
  mesocycleWeeks: z.number().int().min(1).max(16).default(4),
  startDate: z.string().datetime().optional(),
  profile: z.unknown().optional(),
  strengthLevels: z.unknown().optional(),
  goal: z.string().max(128).optional(),
  notes: z.string().max(1024).optional(),
  preferences: WorkoutPlanPreferencesSchema.optional(),
  availableExerciseNames: z.array(z.string().min(1).max(64)).max(100).optional(),
  userContext: PlanGeneratorUserContextSchema.optional(),
});

export const WorkoutPlanGeneratorInputSchema = PlanGeneratorBaseInputSchema.extend({
  type: z.literal('WORKOUT').optional(),
});

export const MealPlanGeneratorInputSchema = PlanGeneratorBaseInputSchema.extend({
  type: z.literal('MEAL').optional(),
});

const GeneratedWorkoutDaySchema = z.object({
  weekIdx: z.number().int().min(0).max(15),
  dayIdx: z.number().int().min(0).max(6),
  title: z.string().min(1).max(64),
  restDay: z.boolean(),
  items: z
    .array(
      z.object({
        exerciseName: z.string().min(1).max(64),
        exerciseId: z.string().min(8).max(64).optional(),
        plannedSets: z.number().int().min(1).max(30),
        plannedReps: z.number().int().min(1).max(100),
        plannedWeightKg: z.number().nonnegative().max(1000).nullable().optional(),
        plannedRestSec: z.number().int().nonnegative().max(3600).default(90),
        notes: z.string().max(256).nullable().optional(),
      }),
    )
    .max(20),
});

export const GeneratedWorkoutPlanSchema = z
  .object({
    type: z.literal('WORKOUT'),
    mesocycleWeeks: z.number().int().min(1).max(16),
    summary: z.string().min(1).max(1024),
    days: z.array(GeneratedWorkoutDaySchema).min(1).max(112),
  })
  .superRefine((data, ctx) => {
    for (let i = 0; i < data.days.length; i += 1) {
      const day = data.days[i];
      if (!day) continue;
      if (!day.restDay && day.items.length < 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `非休息日 W${day.weekIdx + 1} D${day.dayIdx + 1} 至少需要 4 个动作`,
          path: ['days', i, 'items'],
        });
      }
    }
  });
export type GeneratedWorkoutPlan = z.infer<typeof GeneratedWorkoutPlanSchema>;

export const GeneratedMealPlanSchema = z.object({
  type: z.literal('MEAL'),
  mesocycleWeeks: z.number().int().min(1).max(16),
  summary: z.string().min(1).max(1024),
  days: z
    .array(
      z.object({
        weekIdx: z.number().int().min(0).max(15),
        dayIdx: z.number().int().min(0).max(6),
        totalKcal: z.number().nonnegative().max(20_000),
        macros: MacrosSchema,
        items: z
          .array(
            z.object({
              meal: MealTypeSchema,
              dishName: z.string().min(1).max(64),
              ingredients: z
                .array(
                  z.object({
                    foodId: z.string().min(8).max(64).nullable().optional(),
                    dishName: z.string().min(1).max(64).optional(),
                    grams: z.number().nonnegative().max(5000),
                  }),
                )
                .max(50),
              cookingMethod: z.string().max(512).nullable().optional(),
              kcal: z.number().nonnegative().max(10_000),
              macros: MacrosSchema,
            }),
          )
          .max(10),
      }),
    )
    .min(1)
    .max(112),
});
export type GeneratedMealPlan = z.infer<typeof GeneratedMealPlanSchema>;
