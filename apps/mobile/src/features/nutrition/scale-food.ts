import type { Per100g } from '@fitness/shared';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 按 per100g 营养与克数计算单份热量与宏量 */
export function scaleFoodNutrition(per100g: Per100g, grams: number) {
  const ratio = grams / 100;
  return {
    kcal: Math.round(per100g.kcal * ratio),
    macros: {
      protein: round1(per100g.protein * ratio),
      carbs: round1(per100g.carbs * ratio),
      fat: round1(per100g.fat * ratio),
      ...(per100g.fiber != null ? { fiber: round1(per100g.fiber * ratio) } : {}),
      ...(per100g.sodium != null ? { sodium: round1(per100g.sodium * ratio) } : {}),
    },
  };
}
