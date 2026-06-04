import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { setupPendingWorkoutSync } from './pending-workout-sync';

export function usePendingWorkoutSyncRunner() {
  const qc = useQueryClient();

  useEffect(() => setupPendingWorkoutSync(qc), [qc]);
}
