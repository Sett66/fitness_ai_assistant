import {
  MACRO_KCAL_PER_GRAM,
  MACRO_RATIO_DEFAULTS,
  TDEE_GOAL_COEFFICIENT,
} from '../constants/nutrition';
import type { Gender, Goal, MealType } from '../enums';
import type { Macros } from '../schemas/_common';

export type TdeeProfileInput = {
  gender: Gender;
  birthDate: Date;
  heightCm: number;
  weightKg: number;
  trainingYears: number;
  goal: Goal;
};

const MEAL_ORDER: MealType[] = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

export const ageFromBirthDate = (birthDate: Date, at: Date = new Date()): number => {
  let age = at.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = at.getUTCMonth() - birthDate.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && at.getUTCDate() < birthDate.getUTCDate())) {
    age -= 1;
  }
  return Math.max(14, Math.min(age, 100));
};

/** Mifflin-St Jeor BMR × 活动系数 × 目标系数（PRD §5.2） */
export const computeTargetDailyKcal = (profile: TdeeProfileInput): number => {
  const age = ageFromBirthDate(profile.birthDate);
  const w = profile.weightKg;
  const h = profile.heightCm;
  let bmr: number;
  if (profile.gender === 'MALE') {
    bmr = 10 * w + 6.25 * h - 5 * age + 5;
  } else if (profile.gender === 'FEMALE') {
    bmr = 10 * w + 6.25 * h - 5 * age - 161;
  } else {
    const male = 10 * w + 6.25 * h - 5 * age + 5;
    const female = 10 * w + 6.25 * h - 5 * age - 161;
    bmr = (male + female) / 2;
  }

  let activity = 1.375;
  if (profile.trainingYears < 0.5) {
    activity = 1.2;
  } else if (profile.trainingYears >= 3) {
    activity = 1.725;
  } else if (profile.trainingYears >= 1) {
    activity = 1.55;
  }

  const tdee = bmr * activity;
  return Math.round(tdee * TDEE_GOAL_COEFFICIENT[profile.goal]);
};

export const computeMacroTargetsFromKcal = (goal: Goal, targetKcal: number): Macros => {
  const ratio = MACRO_RATIO_DEFAULTS[goal];
  const protein = Math.round((targetKcal * ratio.protein) / MACRO_KCAL_PER_GRAM.protein);
  const carbs = Math.round((targetKcal * ratio.carbs) / MACRO_KCAL_PER_GRAM.carbs);
  const fat = Math.round((targetKcal * ratio.fat) / MACRO_KCAL_PER_GRAM.fat);
  return { protein, carbs, fat };
};

export const sumMacros = (rows: Macros[]): Macros => {
  let fiber = 0;
  let sodium = 0;
  const totals = rows.reduce(
    (acc, row) => {
      fiber += row.fiber ?? 0;
      sodium += row.sodium ?? 0;
      return {
        protein: acc.protein + row.protein,
        carbs: acc.carbs + row.carbs,
        fat: acc.fat + row.fat,
      };
    },
    { protein: 0, carbs: 0, fat: 0 },
  );
  return {
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat,
    ...(fiber > 0 ? { fiber } : {}),
    ...(sodium > 0 ? { sodium } : {}),
  };
};

export const pendingMealTypes = (logged: MealType[]): MealType[] => {
  const set = new Set(logged);
  return MEAL_ORDER.filter((meal) => !set.has(meal));
};

/** 本地日历日边界（按客户端时区偏移分钟，默认 UTC+8） */
export const localDayUtcRange = (
  dateStr: string,
  timezoneOffsetMinutes = 480,
): { start: Date; end: Date } => {
  const parts = dateStr.split('-').map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  start.setUTCMinutes(start.getUTCMinutes() - timezoneOffsetMinutes);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

export const localDateString = (at: Date, timezoneOffsetMinutes = 480): string => {
  const shifted = new Date(at.getTime() + timezoneOffsetMinutes * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
