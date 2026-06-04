import { Pressable, Text, View } from 'react-native';

import type { WorkoutPlanDay } from '@fitness/shared';
import { Card, ChevronRight, Subtitle } from '@fitness/ui';

type TodayExerciseCardProps = {
  day: WorkoutPlanDay | null;
  hasActivePlan: boolean;
  exerciseNameById: Map<string, string>;
  onPressPlan?: () => void;
};

function formatItemLine(
  item: NonNullable<WorkoutPlanDay['items']>[number],
  exerciseNameById: Map<string, string>,
): string {
  const name = exerciseNameById.get(item.exerciseId) ?? '未知动作';
  const weight = item.plannedWeightKg ? ` @ ${item.plannedWeightKg}kg` : '';
  return `${name} · ${item.plannedSets}×${item.plannedReps}${weight}`;
}

export function TodayExerciseCard({
  day,
  hasActivePlan,
  exerciseNameById,
  onPressPlan,
}: TodayExerciseCardProps) {
  if (!hasActivePlan) {
    return (
      <Card className="mb-6">
        <Text className="text-lg font-bold text-foreground">暂无训练计划</Text>
        <Subtitle className="mt-1">请前往计划页生成 AI 训练方案</Subtitle>
      </Card>
    );
  }

  if (!day) {
    return (
      <Card className="mb-6">
        <Text className="text-lg font-bold text-foreground">今日无安排</Text>
        <Subtitle className="mt-1">当前日期不在本周期计划范围内</Subtitle>
      </Card>
    );
  }

  if (day.restDay) {
    return (
      <Card className="mb-6">
        <Text className="text-lg font-bold text-foreground">休息日</Text>
        <Subtitle className="mt-1">{day.title} · 好好恢复，明天继续</Subtitle>
      </Card>
    );
  }

  const items = day.items ?? [];

  return (
    <Pressable onPress={onPressPlan} disabled={!onPressPlan}>
      <Card className="mb-6">
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-lg font-bold text-foreground">{day.title}</Text>
          {onPressPlan ? <ChevronRight size={18} color="#A1A1A1" strokeWidth={2} /> : null}
        </View>
        {items.length === 0 ? (
          <Subtitle>今日训练日暂无动作明细</Subtitle>
        ) : (
          items.map((item) => (
            <Subtitle key={item.id} className="mt-1">
              {formatItemLine(item, exerciseNameById)}
            </Subtitle>
          ))
        )}
        {onPressPlan ? <Subtitle className="mt-3 text-accent">查看完整计划</Subtitle> : null}
      </Card>
    </Pressable>
  );
}
