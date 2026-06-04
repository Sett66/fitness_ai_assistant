import type { WorkoutPlanPreferences, WorkoutSplitType } from '@fitness/shared';

export type GenerateWorkoutPlanInput = {
  mesocycleWeeks: number;
  notes?: string;
  preferences: WorkoutPlanPreferences;
};

export type GenerateMealPlanInput = {
  mesocycleWeeks: number;
  notes?: string;
};

export const SPLIT_TYPE_OPTIONS: { value: WorkoutSplitType; label: string }[] = [
  { value: 'FULL_BODY', label: '全身' },
  { value: 'UPPER_LOWER', label: '上下肢' },
  { value: 'PPL', label: '推拉腿' },
  { value: 'BRO_SPLIT', label: '部位分化' },
];

export const DAYS_PER_WEEK_OPTIONS = [2, 3, 4, 5, 6] as const;
