import type { CreateWorkoutSessionInput } from '@fitness/shared';

import { mmkv } from './mmkv';

const PENDING_SESSIONS_KEY = 'pending.workoutSessions';

export type PendingWorkoutSession = {
  id: string;
  body: CreateWorkoutSessionInput;
  createdAt: string;
};

function loadAll(): PendingWorkoutSession[] {
  const raw = mmkv.getString(PENDING_SESSIONS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PendingWorkoutSession[];
  } catch {
    return [];
  }
}

function saveAll(items: PendingWorkoutSession[]): void {
  if (items.length === 0) {
    mmkv.delete(PENDING_SESSIONS_KEY);
    return;
  }
  mmkv.set(PENDING_SESSIONS_KEY, JSON.stringify(items));
}

export function loadPendingWorkoutSessions(): PendingWorkoutSession[] {
  return loadAll();
}

export function enqueuePendingWorkoutSession(
  body: CreateWorkoutSessionInput,
): PendingWorkoutSession {
  const item: PendingWorkoutSession = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    body,
    createdAt: new Date().toISOString(),
  };
  saveAll([...loadAll(), item]);
  return item;
}

export function removePendingWorkoutSession(id: string): void {
  saveAll(loadAll().filter((item) => item.id !== id));
}

export function getPendingWorkoutSessionCount(): number {
  return loadAll().length;
}
