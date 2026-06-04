import { AppState } from 'react-native';

import { apiFetch } from '../api/client';
import { queryKeys } from '../api/queryKeys';
import type { QueryClient } from '@tanstack/react-query';
import {
  getPendingWorkoutSessionCount,
  loadPendingWorkoutSessions,
  removePendingWorkoutSession,
} from '../storage/pending-workout-sessions';

/** 尝试同步离线打卡；失败则保留队列，下次 App 回到前台再试 */
export async function flushPendingWorkoutSessions(qc: QueryClient): Promise<number> {
  const pending = loadPendingWorkoutSessions();
  if (pending.length === 0) return 0;

  let synced = 0;
  for (const item of pending) {
    try {
      await apiFetch('/workouts/sessions', { method: 'POST', body: item.body });
      removePendingWorkoutSession(item.id);
      synced += 1;
    } catch {
      break;
    }
  }

  if (synced > 0) {
    await qc.invalidateQueries({ queryKey: queryKeys.workoutSessions });
  }

  return getPendingWorkoutSessionCount();
}

export function setupPendingWorkoutSync(qc: QueryClient): () => void {
  const run = () => {
    void flushPendingWorkoutSessions(qc);
  };

  run();
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') run();
  });

  return () => sub.remove();
}
