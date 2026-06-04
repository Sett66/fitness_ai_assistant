import type { Goal } from '../enums';

/**
 * TDEE 目标系数（PRD §5.2）：
 * - 增肌 +10%
 * - 减脂 -20%
 * - 维持 ±0%
 */
export const TDEE_GOAL_COEFFICIENT: Readonly<Record<Goal, number>> = {
  MUSCLE_GAIN: 1.1,
  FAT_LOSS: 0.8,
  MAINTAIN: 1.0,
};

/**
 * 宏量比例缺省（PRD §5.2）：
 * - 增肌 蛋白 30% / 碳水 45% / 脂肪 25%
 * - 减脂 蛋白 40% / 碳水 30% / 脂肪 30%
 * - 维持 给保守默认 蛋白 25% / 碳水 50% / 脂肪 25%（PRD 未明确，沿用通用建议）
 */
export const MACRO_RATIO_DEFAULTS: Readonly<
  Record<Goal, { protein: number; carbs: number; fat: number }>
> = {
  MUSCLE_GAIN: { protein: 0.3, carbs: 0.45, fat: 0.25 },
  FAT_LOSS: { protein: 0.4, carbs: 0.3, fat: 0.3 },
  MAINTAIN: { protein: 0.25, carbs: 0.5, fat: 0.25 },
};

/** 每克营养素热量值（kcal / g） */
export const MACRO_KCAL_PER_GRAM = {
  protein: 4,
  carbs: 4,
  fat: 9,
} as const;
