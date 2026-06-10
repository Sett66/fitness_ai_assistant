import { expandMealPlanDays } from '../src/domain/expand-meal-plan-days';

const baseDay = {
  weekIdx: 0,
  dayIdx: 0,
  totalKcal: 2000,
  macros: { protein: 150, carbs: 200, fat: 60 },
  items: [
    {
      meal: 'BREAKFAST' as const,
      dishName: '早餐',
      ingredients: [{ dishName: '燕麦', grams: 50 }],
      kcal: 400,
      macros: { protein: 20, carbs: 50, fat: 10 },
    },
  ],
};

describe('expandMealPlanDays', () => {
  it('expands a single day to full mesocycle', () => {
    const result = expandMealPlanDays([baseDay], 4);
    expect(result).toHaveLength(28);
    expect(result.filter((d) => d.weekIdx === 3 && d.dayIdx === 6)).toHaveLength(1);
  });

  it('expands 7 week-0 days to all weeks', () => {
    const week0 = Array.from({ length: 7 }, (_, dayIdx) => ({
      ...baseDay,
      dayIdx,
      dishName: `day-${dayIdx}`,
    }));
    const result = expandMealPlanDays(week0, 4);
    expect(result).toHaveLength(28);
    expect(new Set(result.map((d) => d.weekIdx))).toEqual(new Set([0, 1, 2, 3]));
  });

  it('leaves full plans unchanged', () => {
    const full = Array.from({ length: 28 }, (_, i) => ({
      ...baseDay,
      weekIdx: Math.floor(i / 7),
      dayIdx: i % 7,
    }));
    expect(expandMealPlanDays(full, 4)).toHaveLength(28);
  });
});
