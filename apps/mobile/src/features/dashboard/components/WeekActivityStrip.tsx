/**
 * 本周训练 7 日色块。
 *
 * TODO(workoutCategory): 待 WorkoutPlanDay.workoutCategory 字段落地后，
 * 改读库字段并移除 title 启发式（见 docs/HANDOFF-M4.md §Dashboard）。
 */
import { Text, View } from 'react-native';

import type { WorkoutPlanDay, WorkoutSessionResponse } from '@fitness/shared';
import { Card, useTheme } from '@fitness/ui';

import { buildWeekActivityCells, type WorkoutCategory } from '../utils/week-activity';

/** 有氧训练色（与 accent 区分） */
const CARDIO_FILL = '#38BDF8';

type WeekActivityStripProps = {
  sessions: WorkoutSessionResponse[];
  planDays: WorkoutPlanDay[];
};

function fillColor(category: WorkoutCategory, accent: string): string {
  return category === 'CARDIO' ? CARDIO_FILL : accent;
}

export function WeekActivityStrip({ sessions, planDays }: WeekActivityStripProps) {
  const { colors } = useTheme();
  const cells = buildWeekActivityCells(sessions, planDays);

  return (
    <Card className="mb-6">
      <View className="flex-row justify-between gap-2">
        {cells.map((cell) => {
          const borderClass = cell.isToday ? 'border-accent border-2' : 'border-border border';
          const backgroundColor = cell.category
            ? fillColor(cell.category, colors.accent)
            : colors.surface;

          return (
            <View key={cell.dateKey} className="flex-1 items-center gap-1">
              <Text
                className={`text-xs ${cell.isToday ? 'font-semibold text-accent' : 'text-muted'}`}
              >
                {cell.weekdayLabel}
              </Text>
              <Text
                className={`text-[10px] ${cell.isToday ? 'font-medium text-accent' : 'text-muted'}`}
              >
                {cell.date.getDate()}
              </Text>
              <View
                className={`h-10 w-full rounded-lg ${borderClass}`}
                style={{ backgroundColor }}
              />
            </View>
          );
        })}
      </View>
      <View className="mt-3 flex-row gap-4">
        <View className="flex-row items-center gap-1.5">
          <View className="h-3 w-3 rounded-sm" style={{ backgroundColor: colors.accent }} />
          <Text className="text-xs text-muted">力量</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <View className="h-3 w-3 rounded-sm" style={{ backgroundColor: CARDIO_FILL }} />
          <Text className="text-xs text-muted">有氧</Text>
        </View>
      </View>
    </Card>
  );
}
