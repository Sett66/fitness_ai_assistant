import type { GeneratedMealPlan } from '@fitness/ai-core';

type MealDay = GeneratedMealPlan['days'][number];

/** 将 AI 返回的少量日菜单铺开到完整 mesocycle（每周 7 天 × N 周） */
export function expandMealPlanDays(days: MealDay[], mesocycleWeeks: number): MealDay[] {
  const targetCount = mesocycleWeeks * 7;
  if (days.length === 0 || days.length >= targetCount) {
    return days;
  }

  let template = days.filter((d) => d.weekIdx === 0);
  if (template.length === 0) {
    const minWeek = Math.min(...days.map((d) => d.weekIdx));
    template = days.filter((d) => d.weekIdx === minWeek);
  }

  if (template.length === 1) {
    const single = template[0]!;
    template = Array.from({ length: 7 }, (_, dayIdx) => ({
      ...single,
      dayIdx,
      weekIdx: 0,
    }));
  }

  const byDayIdx = new Map<number, MealDay>();
  for (const d of template) {
    if (!byDayIdx.has(d.dayIdx)) {
      byDayIdx.set(d.dayIdx, d);
    }
  }
  const fallbackDay = template[0]!;
  const week0Full: MealDay[] = Array.from({ length: 7 }, (_, dayIdx) => {
    const existing = byDayIdx.get(dayIdx);
    if (existing) {
      return { ...existing, weekIdx: 0, dayIdx };
    }
    const clone = byDayIdx.get(0) ?? fallbackDay;
    return { ...clone, weekIdx: 0, dayIdx };
  });

  const expanded: MealDay[] = [];
  for (let w = 0; w < mesocycleWeeks; w += 1) {
    for (const d of week0Full) {
      expanded.push({ ...d, weekIdx: w });
    }
  }
  return expanded;
}
