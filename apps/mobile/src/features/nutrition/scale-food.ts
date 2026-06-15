import type { Per100g } from '@fitness/shared';
import { scaleFoodNutrition as scaleFromShared } from '@fitness/shared';

/** @deprecated 请直接使用 @fitness/shared 的 scaleFoodNutrition */
export function scaleFoodNutrition(per100g: Per100g, grams: number) {
  return scaleFromShared(per100g, grams);
}
