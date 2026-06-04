import { MMKV } from 'react-native-mmkv';

export const mmkv = new MMKV({ id: 'fitness-mobile' });

const DRAFT_WORKOUT_KEY = 'draft.workout';

export type WorkoutDraft = {
  plannedDayId?: string;
  sets: Array<{
    exerciseId: string;
    setIdx: number;
    actualReps: number;
    actualWeightKg: number;
    rir?: number;
    isCompleted: boolean;
  }>;
  note?: string;
  updatedAt: string;
};

export function saveWorkoutDraft(draft: WorkoutDraft): void {
  mmkv.set(DRAFT_WORKOUT_KEY, JSON.stringify(draft));
}

export function loadWorkoutDraft(): WorkoutDraft | null {
  const raw = mmkv.getString(DRAFT_WORKOUT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WorkoutDraft;
  } catch {
    return null;
  }
}

export function clearWorkoutDraft(): void {
  mmkv.delete(DRAFT_WORKOUT_KEY);
}
