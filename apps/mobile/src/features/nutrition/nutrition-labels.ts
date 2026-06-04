import type { MealType } from '@fitness/shared';

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  BREAKFAST: '早餐',
  LUNCH: '午餐',
  DINNER: '晚餐',
  SNACK: '加餐',
};

export function mealTypeLabel(type: MealType): string {
  return MEAL_TYPE_LABELS[type] ?? type;
}
