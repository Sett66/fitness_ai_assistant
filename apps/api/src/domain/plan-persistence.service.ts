import { Injectable, Logger } from '@nestjs/common';
import type { GeneratedMealPlan, GeneratedWorkoutPlan } from '@fitness/ai-core';
import { DEFAULT_MESOCYCLE_WEEKS } from '@fitness/shared';

import { type PrismaService } from '../infra/prisma/prisma.service';
import { expandMealPlanDays } from './expand-meal-plan-days';

@Injectable()
export class PlanPersistenceService {
  private readonly logger = new Logger(PlanPersistenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async persistWorkoutPlan(
    userId: string,
    aiRunId: string,
    generated: GeneratedWorkoutPlan,
    startDateInput?: string,
  ): Promise<string> {
    const mesocycleWeeks = generated.mesocycleWeeks ?? DEFAULT_MESOCYCLE_WEEKS;
    const startDate = startDateInput ? new Date(startDateInput) : new Date();
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + mesocycleWeeks * 7);

    const exerciseIndex = await this.buildExerciseNameIndex();

    return this.prisma.client.$transaction(async (tx) => {
      await tx.plan.updateMany({
        where: { userId, type: 'WORKOUT', status: 'ACTIVE', deletedAt: null },
        data: { status: 'COMPLETED' },
      });

      const plan = await tx.plan.create({
        data: {
          userId,
          type: 'WORKOUT',
          mesocycleWeeks,
          startDate,
          endDate,
          status: 'ACTIVE',
          aiRunId,
        },
      });

      for (const day of generated.days) {
        const planDay = await tx.workoutPlanDay.create({
          data: {
            planId: plan.id,
            weekIdx: day.weekIdx,
            dayIdx: day.dayIdx,
            title: day.title,
            restDay: day.restDay,
          },
        });

        let itemIdx = 0;
        for (const item of day.items) {
          const exerciseId =
            item.exerciseId && exerciseIndex.byId.has(item.exerciseId)
              ? item.exerciseId
              : this.resolveExerciseId(item.exerciseName, exerciseIndex);
          if (!exerciseId) {
            this.logger.warn(`跳过未知动作�?{item.exerciseName}`);
            continue;
          }
          await tx.workoutPlanItem.create({
            data: {
              workoutPlanDayId: planDay.id,
              exerciseId,
              itemIdx,
              plannedSets: item.plannedSets,
              plannedReps: item.plannedReps,
              plannedWeightKg: item.plannedWeightKg ?? null,
              plannedRestSec: item.plannedRestSec ?? 90,
              notes: item.notes ?? null,
            },
          });
          itemIdx += 1;
        }
      }

      return plan.id;
    });
  }

  async persistMealPlan(
    userId: string,
    aiRunId: string,
    generated: GeneratedMealPlan,
    startDateInput?: string,
  ): Promise<string> {
    const mesocycleWeeks = generated.mesocycleWeeks ?? DEFAULT_MESOCYCLE_WEEKS;
    const startDate = startDateInput ? new Date(startDateInput) : new Date();
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + mesocycleWeeks * 7);

    return this.prisma.client.$transaction(async (tx) => {
      await tx.plan.updateMany({
        where: { userId, type: 'MEAL', status: 'ACTIVE', deletedAt: null },
        data: { status: 'COMPLETED' },
      });

      const plan = await tx.plan.create({
        data: {
          userId,
          type: 'MEAL',
          mesocycleWeeks,
          startDate,
          endDate,
          status: 'ACTIVE',
          aiRunId,
        },
      });

      const mealDays = expandMealPlanDays(generated.days, mesocycleWeeks);
      if (mealDays.length > generated.days.length) {
        this.logger.log(
          `饮食计划�?${generated.days.length} 天展开�?${mealDays.length} 天（${mesocycleWeeks} 周）`,
        );
      }

      for (const day of mealDays) {
        const planDay = await tx.mealPlanDay.create({
          data: {
            planId: plan.id,
            weekIdx: day.weekIdx,
            dayIdx: day.dayIdx,
            totalKcal: day.totalKcal,
            macroProtein: day.macros.protein,
            macroCarbs: day.macros.carbs,
            macroFat: day.macros.fat,
            macroFiber: day.macros.fiber ?? null,
            macroSodium: day.macros.sodium ?? null,
          },
        });

        for (const item of day.items) {
          await tx.mealPlanItem.create({
            data: {
              mealPlanDayId: planDay.id,
              meal: item.meal,
              dishName: item.dishName,
              ingredients: item.ingredients,
              cookingMethod: item.cookingMethod ?? null,
              kcal: item.kcal,
              macroProtein: item.macros.protein,
              macroCarbs: item.macros.carbs,
              macroFat: item.macros.fat,
              macroFiber: item.macros.fiber ?? null,
              macroSodium: item.macros.sodium ?? null,
            },
          });
        }
      }

      return plan.id;
    });
  }

  private async buildExerciseNameIndex() {
    const exercises = await this.prisma.client.exercise.findMany({
      where: { deletedAt: null, isPreset: true },
      select: { id: true, nameZh: true },
    });
    const byName = new Map<string, string>();
    const byId = new Set<string>();
    for (const ex of exercises) {
      byName.set(ex.nameZh, ex.id);
      byId.add(ex.id);
    }
    return { byName, byId };
  }

  private resolveExerciseId(
    exerciseName: string,
    index: { byName: Map<string, string> },
  ): string | null {
    const exact = index.byName.get(exerciseName);
    if (exact) {
      return exact;
    }
    for (const [nameZh, id] of index.byName.entries()) {
      if (nameZh.includes(exerciseName) || exerciseName.includes(nameZh)) {
        return id;
      }
    }
    return null;
  }
}
