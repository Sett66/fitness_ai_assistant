import { Injectable } from '@nestjs/common';
import type { UserAiContext } from '@fitness/shared';
import { WorkoutPlanPreferencesSchema } from '@fitness/shared';

import { type PrismaService } from '../infra/prisma/prisma.service';
import { type NutritionDailyService } from './nutrition-daily.service';

@Injectable()
export class UserContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nutritionDaily: NutritionDailyService,
  ) {}

  async build(
    userId: string,
    options?: { timezoneOffsetMinutes?: number },
  ): Promise<UserAiContext> {
    const [profile, strengthLevels, activeWorkout, activeMeal, todayNutrition] = await Promise.all([
      this.prisma.client.profile.findUnique({ where: { userId } }),
      this.prisma.client.strengthLevel.findMany({
        where: { userId },
        include: { exercise: { select: { nameZh: true, equipment: true } } },
        orderBy: { recordedAt: 'desc' },
        take: 20,
      }),
      this.prisma.client.plan.findFirst({
        where: { userId, type: 'WORKOUT', status: 'ACTIVE', deletedAt: null },
        orderBy: { startDate: 'desc' },
        include: { workoutDays: { take: 3, orderBy: [{ weekIdx: 'asc' }, { dayIdx: 'asc' }] } },
      }),
      this.prisma.client.plan.findFirst({
        where: { userId, type: 'MEAL', status: 'ACTIVE', deletedAt: null },
        orderBy: { startDate: 'desc' },
        include: { mealDays: { take: 2, orderBy: [{ weekIdx: 'asc' }, { dayIdx: 'asc' }] } },
      }),
      this.nutritionDaily.buildTodaySummary(userId, {
        timezoneOffsetMinutes: options?.timezoneOffsetMinutes,
      }),
    ]);

    return {
      profile: profile
        ? {
            userId: profile.userId,
            gender: profile.gender,
            birthDate: profile.birthDate,
            heightCm: profile.heightCm,
            weightKg: profile.weightKg,
            trainingYears: profile.trainingYears,
            goal: profile.goal,
            updatedAt: profile.updatedAt,
          }
        : null,
      strengthLevels: strengthLevels.map((row) => ({
        id: row.id,
        userId: row.userId,
        exerciseId: row.exerciseId,
        exerciseName: row.exercise.nameZh,
        exerciseEquipment: row.exercise.equipment,
        oneRm: row.oneRm,
        workingWeightKg: row.workingWeightKg,
        maxReps: row.maxReps,
        loadAdjustmentKg: row.loadAdjustmentKg,
        recordedAt: row.recordedAt,
      })),
      activeWorkoutPlan: activeWorkout
        ? {
            id: activeWorkout.id,
            summary: `训练计划 ${activeWorkout.mesocycleWeeks} 周，${activeWorkout.workoutDays.map((d) => d.title).join('、')}`,
          }
        : null,
      activeMealPlan: activeMeal
        ? {
            id: activeMeal.id,
            summary: `饮食计划日均约 ${activeMeal.mealDays[0]?.totalKcal ?? '?'} kcal`,
          }
        : null,
      todayNutrition: todayNutrition ?? undefined,
    };
  }

  async mergePlanGeneratorInput(
    userId: string,
    clientInput: Record<string, unknown>,
    options?: { timezoneOffsetMinutes?: number },
  ): Promise<Record<string, unknown>> {
    const [ctx, exercises] = await Promise.all([
      this.build(userId, options),
      this.prisma.client.exercise.findMany({
        where: {
          deletedAt: null,
          OR: [{ isPreset: true }, { ownerUserId: userId }],
        },
        select: { nameZh: true },
        orderBy: { nameZh: 'asc' },
        take: 100,
      }),
    ]);

    const goal =
      ctx.profile?.goal != null
        ? { MUSCLE_GAIN: '增肌', FAT_LOSS: '减脂', MAINTAIN: '维持' }[ctx.profile.goal]
        : undefined;

    const preferences =
      clientInput.preferences != null
        ? WorkoutPlanPreferencesSchema.parse(clientInput.preferences)
        : undefined;

    return {
      ...clientInput,
      profile: ctx.profile ?? clientInput.profile,
      strengthLevels:
        ctx.strengthLevels.length > 0 ? ctx.strengthLevels : clientInput.strengthLevels,
      goal: clientInput.goal ?? goal,
      preferences,
      availableExerciseNames: exercises.map((row) => row.nameZh),
      userContext: {
        activeWorkoutPlanSummary: ctx.activeWorkoutPlan?.summary,
        activeMealPlanSummary: ctx.activeMealPlan?.summary,
        todayNutrition: ctx.todayNutrition,
      },
      notes: clientInput.notes,
    };
  }
}
