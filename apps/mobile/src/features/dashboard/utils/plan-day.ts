import type { MealPlanDay, WorkoutPlanDay } from '@fitness/shared';

type PlanAnchor = {
  startDate: string | Date;
  mesocycleWeeks: number;
};

/** 从计划 startDate 起算日历日，映射到 weekIdx / dayIdx 对应的训练日 */
export function resolvePlanDayForDate(
  plan: PlanAnchor,
  workoutDays: WorkoutPlanDay[],
  date: Date = new Date(),
): WorkoutPlanDay | null {
  const start = new Date(plan.startDate);
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const dayOffset = Math.floor((target.getTime() - start.getTime()) / 86_400_000);
  if (dayOffset < 0) return null;

  const maxDays = plan.mesocycleWeeks * 7;
  if (dayOffset >= maxDays) return null;

  const weekIdx = Math.floor(dayOffset / 7);
  const dayIdx = dayOffset % 7;

  return workoutDays.find((d) => d.weekIdx === weekIdx && d.dayIdx === dayIdx) ?? null;
}

/** 从计划 startDate 起算日历日，映射到 weekIdx / dayIdx 对应的饮食日 */
export function resolveMealPlanDayForDate(
  plan: PlanAnchor,
  mealDays: MealPlanDay[],
  date: Date = new Date(),
): MealPlanDay | null {
  const start = new Date(plan.startDate);
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const dayOffset = Math.floor((target.getTime() - start.getTime()) / 86_400_000);
  if (dayOffset < 0) return null;

  const maxDays = plan.mesocycleWeeks * 7;
  if (dayOffset >= maxDays) return null;

  const weekIdx = Math.floor(dayOffset / 7);
  const dayIdx = dayOffset % 7;

  return mealDays.find((d) => d.weekIdx === weekIdx && d.dayIdx === dayIdx) ?? null;
}

export function formatMealPlanDayLabel(day: MealPlanDay): string {
  return `W${day.weekIdx + 1} D${day.dayIdx + 1}`;
}

export function listPlanTrainingDays(workoutDays: WorkoutPlanDay[]): WorkoutPlanDay[] {
  return workoutDays.filter((d) => !d.restDay && (d.items?.length ?? 0) > 0);
}

export type WorkoutDaySelection = {
  calendarDay: WorkoutPlanDay | null;
  selectedDay: WorkoutPlanDay | null;
  trainingDays: WorkoutPlanDay[];
  hint: string;
};

/** 打卡页：优先今日训练日；休息日/无动作时回退到计划内其他训练日，而非全库 */
export function resolveWorkoutDaySelection(
  plan: PlanAnchor,
  workoutDays: WorkoutPlanDay[],
  date: Date = new Date(),
): WorkoutDaySelection {
  const trainingDays = listPlanTrainingDays(workoutDays);
  const calendarDay = resolvePlanDayForDate(plan, workoutDays, date);

  if (calendarDay && !calendarDay.restDay && (calendarDay.items?.length ?? 0) > 0) {
    return {
      calendarDay,
      selectedDay: calendarDay,
      trainingDays,
      hint: `今日 · ${calendarDay.title}`,
    };
  }

  if (calendarDay?.restDay) {
    const sameWeek = trainingDays.filter((d) => d.weekIdx === calendarDay.weekIdx);
    const fallback = sameWeek[0] ?? trainingDays[0] ?? null;
    if (fallback) {
      return {
        calendarDay,
        selectedDay: fallback,
        trainingDays,
        hint: `今日休息 · 以下为计划内「W${fallback.weekIdx + 1} D${fallback.dayIdx + 1} ${fallback.title}」动作`,
      };
    }
    return {
      calendarDay,
      selectedDay: null,
      trainingDays,
      hint: '今日休息 · 当前计划暂无可用训练动作',
    };
  }

  const fallback = trainingDays[0] ?? null;
  if (fallback) {
    return {
      calendarDay,
      selectedDay: fallback,
      trainingDays,
      hint: calendarDay
        ? '今日训练日暂无动作 · 已显示计划中其他训练日'
        : '今日不在计划周期内 · 已显示计划中的训练动作',
    };
  }

  return {
    calendarDay,
    selectedDay: null,
    trainingDays,
    hint: '当前计划暂无训练动作',
  };
}

export function formatPlanDayLabel(day: WorkoutPlanDay): string {
  return `W${day.weekIdx + 1} D${day.dayIdx + 1} · ${day.title}`;
}
