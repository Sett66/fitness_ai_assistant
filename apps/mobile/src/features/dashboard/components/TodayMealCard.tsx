import { Pressable, Text, View } from 'react-native';

import type { MealPlanDay } from '@fitness/shared';
import { Card, ChevronRight, MacroRow, Subtitle } from '@fitness/ui';

import { mealTypeLabel } from '../../nutrition/nutrition-labels';
import { formatMealPlanDayLabel } from '../utils/plan-day';

type TodayMealCardProps = {
  day: MealPlanDay | null;
  hasActivePlan: boolean;
  onPressPlan?: () => void;
};

export function TodayMealCard({ day, hasActivePlan, onPressPlan }: TodayMealCardProps) {
  if (!hasActivePlan) {
    return (
      <Card className="mb-6">
        <Text className="text-lg font-bold text-foreground">暂无饮食计划</Text>
        <Subtitle className="mt-1">在 Coach 中生成饮食方案后会显示在这里</Subtitle>
      </Card>
    );
  }

  if (!day) {
    return (
      <Card className="mb-6">
        <Text className="text-lg font-bold text-foreground">今日无饮食安排</Text>
        <Subtitle className="mt-1">当前日期不在本周期计划范围内</Subtitle>
      </Card>
    );
  }

  const items = day.items ?? [];

  return (
    <Pressable onPress={onPressPlan} disabled={!onPressPlan}>
      <Card className="mb-6">
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-foreground">
            今日饮食 · {formatMealPlanDayLabel(day)}
          </Text>
          {onPressPlan ? <ChevronRight size={18} color="#A1A1A1" strokeWidth={2} /> : null}
        </View>
        <MacroRow label="日总热量" value={day.totalKcal} unit=" kcal" />
        {items.length === 0 ? (
          <Subtitle className="mt-2">今日暂无餐次明细</Subtitle>
        ) : (
          items.map((meal) => (
            <Subtitle key={meal.id} className="mt-2">
              {mealTypeLabel(meal.meal)} · {meal.dishName} · {meal.kcal} kcal
            </Subtitle>
          ))
        )}
        {onPressPlan ? <Subtitle className="mt-3 text-accent">查看完整计划</Subtitle> : null}
      </Card>
    </Pressable>
  );
}
