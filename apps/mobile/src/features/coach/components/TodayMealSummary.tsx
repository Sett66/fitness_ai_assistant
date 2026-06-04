import { View } from 'react-native';

import { Card, MacroRow, Subtitle, Title } from '@fitness/ui';

import { useDailySummary, useMealLogs } from '../../../api/endpoints/fitness';
import { mealTypeLabel } from '../../nutrition/nutrition-labels';

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function TodayMealSummary() {
  const date = todayString();
  const summary = useDailySummary(date);
  const logs = useMealLogs(date);

  if (summary.isLoading) return null;

  return (
    <View className="px-4 pb-2">
      <Card className="gap-1">
        <Title className="text-base">今日饮食</Title>
        {summary.data ? (
          <>
            <MacroRow label="已摄入" value={summary.data.consumedKcal} unit=" kcal" />
            <MacroRow label="剩余" value={summary.data.remainingKcal} unit=" kcal" />
          </>
        ) : (
          <Subtitle>暂无营养摘要</Subtitle>
        )}
        {(logs.data?.items.length ?? 0) > 0 ? (
          <Subtitle className="mt-1">
            已记录 {logs.data!.items.length} 餐：
            {logs.data!.items.map((l) => mealTypeLabel(l.mealType)).join('、')}
          </Subtitle>
        ) : (
          <Subtitle className="mt-1">今日暂无饮食记录</Subtitle>
        )}
      </Card>
    </View>
  );
}
