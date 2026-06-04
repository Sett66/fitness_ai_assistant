import type { WorkoutPlanDay, WorkoutSessionResponse } from '@fitness/shared';

import { classifySession } from './week-activity';

/** 力量 / 有氧 MET（估算运动消耗，待后端实装精确值后替换） */
const MET_BY_CATEGORY = { STRENGTH: 6, CARDIO: 8 } as const;

const SECONDS_PER_SET_FALLBACK = 180;
const DEFAULT_BURN_TARGET_KCAL = 400;

function sessionDurationSec(session: WorkoutSessionResponse): number {
  if (session.durationSec != null && session.durationSec > 0) {
    return session.durationSec;
  }
  const setCount = session.sets?.length ?? 0;
  return setCount > 0 ? setCount * SECONDS_PER_SET_FALLBACK : 0;
}

/** 单节训练估算消耗（kcal）= MET × 体重(kg) × 时长(h) */
export function estimateSessionBurnKcal(
  session: WorkoutSessionResponse,
  weightKg: number,
  planDayById: Map<string, WorkoutPlanDay>,
): number {
  const durationSec = sessionDurationSec(session);
  if (durationSec <= 0 || weightKg <= 0) return 0;

  const category = classifySession(session, planDayById);
  const met = MET_BY_CATEGORY[category];
  const hours = durationSec / 3600;
  return Math.round(met * weightKg * hours);
}

export function estimateTodayWorkoutBurnKcal(
  sessions: WorkoutSessionResponse[],
  weightKg: number,
  planDays: WorkoutPlanDay[],
  dateKey: string,
): { totalKcal: number; sessionCount: number } {
  const planDayById = new Map(planDays.map((d) => [d.id, d]));
  const todaySessions = sessions.filter((s) => {
    const d = new Date(s.performedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return key === dateKey;
  });

  const totalKcal = todaySessions.reduce(
    (sum, session) => sum + estimateSessionBurnKcal(session, weightKg, planDayById),
    0,
  );

  return { totalKcal, sessionCount: todaySessions.length };
}

export function defaultBurnTargetKcal(): number {
  return DEFAULT_BURN_TARGET_KCAL;
}
