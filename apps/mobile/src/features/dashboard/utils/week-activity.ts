/**
 * 本周训练色块逻辑。
 *
 * TODO(workoutCategory): WorkoutPlanDay / WorkoutSession 增加
 * `workoutCategory: STRENGTH | CARDIO` 后，改为读库字段并删除 title 启发式。
 */
import type { WorkoutPlanDay, WorkoutSessionResponse } from '@fitness/shared';

export type WorkoutCategory = 'STRENGTH' | 'CARDIO';

export type WeekDayCell = {
  date: Date;
  dateKey: string;
  weekdayLabel: string;
  isToday: boolean;
  category: WorkoutCategory | null;
};

const CARDIO_TITLE_PATTERN = /有氧|跑步|hiit|椭圆|跳绳|cardio|骑行|游泳/i;

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

export function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function inferCategoryFromPlanDayTitle(title: string): WorkoutCategory {
  return CARDIO_TITLE_PATTERN.test(title) ? 'CARDIO' : 'STRENGTH';
}

export function classifySession(
  session: WorkoutSessionResponse,
  planDayById: Map<string, WorkoutPlanDay>,
): WorkoutCategory {
  if (session.plannedDayId) {
    const day = planDayById.get(session.plannedDayId);
    if (day) return inferCategoryFromPlanDayTitle(day.title);
  }
  return 'STRENGTH';
}

function mergeCategories(a: WorkoutCategory | null, b: WorkoutCategory): WorkoutCategory {
  if (a === 'STRENGTH' || b === 'STRENGTH') return 'STRENGTH';
  return b;
}

export function buildWeekActivityCells(
  sessions: WorkoutSessionResponse[],
  planDays: WorkoutPlanDay[],
  referenceDate: Date = new Date(),
): WeekDayCell[] {
  const weekStart = startOfWeekMonday(referenceDate);
  const todayKey = toDateKey(referenceDate);
  const planDayById = new Map(planDays.map((d) => [d.id, d]));

  const categoryByDate = new Map<string, WorkoutCategory>();
  for (const session of sessions) {
    const key = toDateKey(new Date(session.performedAt));
    const cat = classifySession(session, planDayById);
    categoryByDate.set(key, mergeCategories(categoryByDate.get(key) ?? null, cat));
  }

  return WEEKDAY_LABELS.map((weekdayLabel, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const dateKey = toDateKey(date);
    return {
      date,
      dateKey,
      weekdayLabel,
      isToday: dateKey === todayKey,
      category: categoryByDate.get(dateKey) ?? null,
    };
  });
}
