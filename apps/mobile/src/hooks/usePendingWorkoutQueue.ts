import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';

import { getPendingWorkoutSessionCount } from '../storage/pending-workout-sessions';
import { flushPendingWorkoutSessions } from './pending-workout-sync';

export function usePendingWorkoutQueue() {
  const qc = useQueryClient();
  const [pendingCount, setPendingCount] = useState(getPendingWorkoutSessionCount());
  const [syncing, setSyncing] = useState(false);

  const refreshCount = useCallback(() => {
    setPendingCount(getPendingWorkoutSessionCount());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshCount();
    }, [refreshCount]),
  );

  const flushPendingSessions = useCallback(async () => {
    setSyncing(true);
    const remaining = await flushPendingWorkoutSessions(qc);
    setPendingCount(remaining);
    setSyncing(false);
  }, [qc]);

  return { pendingCount, syncing, flushPendingSessions };
}
