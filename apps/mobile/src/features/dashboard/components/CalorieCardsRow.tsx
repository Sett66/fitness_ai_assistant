import { View } from 'react-native';

import type {
  NutritionDailySummary,
  WorkoutPlanDay,
  WorkoutSessionResponse,
} from '@fitness/shared';
import { Dumbbell, Flame, Subtitle } from '@fitness/ui';

import { defaultBurnTargetKcal, estimateTodayWorkoutBurnKcal } from '../utils/workout-calories';
import { CalorieMetricCard } from './CalorieMetricCard';

type CalorieCardsRowProps = {
  summary: NutritionDailySummary;
  sessions: WorkoutSessionResponse[];
  planDays: WorkoutPlanDay[];
  weightKg: number;
  dateKey: string;
};

export function CalorieCardsRow({
  summary,
  sessions,
  planDays,
  weightKg,
  dateKey,
}: CalorieCardsRowProps) {
  const { consumedKcal, targetKcal } = summary;
  const consumedProgress = targetKcal > 0 ? Math.min(consumedKcal / targetKcal, 1) : 0;

  const { totalKcal: burnKcal, sessionCount } = estimateTodayWorkoutBurnKcal(
    sessions,
    weightKg,
    planDays,
    dateKey,
  );
  const burnTarget = defaultBurnTargetKcal();
  const burnProgress = burnTarget > 0 ? Math.min(burnKcal / burnTarget, 1) : 0;

  const burnSubtitle =
    sessionCount > 0 ? `估算 · 今日 ${sessionCount} 次训练` : '完成训练打卡后更新';

  return (
    <View className="mb-4 gap-3">
      <CalorieMetricCard
        variant="default"
        title="训练消耗"
        subtitle={burnSubtitle}
        value={burnKcal}
        progress={burnProgress}
        icon={<Dumbbell size={18} color="#D0FD3E" strokeWidth={2} />}
      />
      <CalorieMetricCard
        variant="accent"
        title="今日摄入"
        subtitle={`目标 ${Math.round(targetKcal)} kcal`}
        value={consumedKcal}
        progress={consumedProgress}
        icon={<Flame size={18} color="#0A0A0A" strokeWidth={2} />}
      />
      <Subtitle className="text-xs opacity-60">
        训练消耗为基于时长与体重的估算值；摄入目标来自档案 TDEE
      </Subtitle>
    </View>
  );
}

export function CalorieCardsPlaceholder() {
  return (
    <View className="mb-4 rounded-2xl border border-border bg-card p-4">
      <Subtitle>完成档案后显示今日营养与训练消耗</Subtitle>
    </View>
  );
}
