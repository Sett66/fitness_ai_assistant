import { Injectable } from '@nestjs/common';
import type { NutritionDailySummary } from '@fitness/shared';
import {
  computeMacroTargetsFromKcal,
  computeTargetDailyKcal,
  localDateString,
  localDayUtcRange,
  pendingMealTypes,
  sumMacros,
  type TdeeProfileInput,
} from '@fitness/shared';

import { type PrismaService } from '../infra/prisma/prisma.service';

@Injectable()
export class NutritionDailyService {
  constructor(private readonly prisma: PrismaService) {}

  async buildTodaySummary(
    userId: string,
    options?: { date?: string; timezoneOffsetMinutes?: number },
  ): Promise<NutritionDailySummary | null> {
    const tz = options?.timezoneOffsetMinutes ?? 480;
    const date = options?.date ?? localDateString(new Date(), tz);
    const profile = await this.prisma.client.profile.findUnique({ where: { userId } });
    if (!profile) {
      return null;
    }

    const { start, end } = localDayUtcRange(date, tz);
    const logs = await this.prisma.client.mealLog.findMany({
      where: {
        userId,
        deletedAt: null,
        takenAt: { gte: start, lt: end },
      },
      include: { items: true },
    });

    const consumedKcal = logs.reduce((sum, log) => sum + log.totalKcal, 0);
    const consumedMacros = sumMacros(
      logs.map((log) => ({
        protein: log.macroProtein,
        carbs: log.macroCarbs,
        fat: log.macroFat,
        ...(log.macroFiber != null ? { fiber: log.macroFiber } : {}),
        ...(log.macroSodium != null ? { sodium: log.macroSodium } : {}),
      })),
    );

    const tdeeInput: TdeeProfileInput = {
      gender: profile.gender,
      birthDate: profile.birthDate,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      trainingYears: profile.trainingYears,
      goal: profile.goal,
    };
    const targetKcal = computeTargetDailyKcal(tdeeInput);
    const targetMacros = computeMacroTargetsFromKcal(profile.goal, targetKcal);
    const mealsLoggedToday = [...new Set(logs.map((log) => log.mealType))];

    return {
      date,
      targetKcal,
      targetMacros,
      consumedKcal,
      consumedMacros,
      remainingKcal: targetKcal - consumedKcal,
      mealsLoggedToday,
      pendingMeals: pendingMealTypes(mealsLoggedToday),
    };
  }
}
