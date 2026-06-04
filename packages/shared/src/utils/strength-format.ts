import type { ExerciseEquipment } from '../enums';

export function formatKg(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export type StrengthDisplayInput = {
  exerciseEquipment?: ExerciseEquipment | null;
  oneRm?: number | null;
  workingWeightKg?: number | null;
  maxReps?: number | null;
  loadAdjustmentKg?: number | null;
};

function formatLoadAdjustment(loadAdjustmentKg: number): string {
  if (loadAdjustmentKg < 0) {
    return `辅助 ${formatKg(Math.abs(loadAdjustmentKg))} kg`;
  }
  if (loadAdjustmentKg > 0) {
    return `负重 ${formatKg(loadAdjustmentKg)} kg`;
  }
  return '';
}

/** 档案摘要 / 列表展示用 */
export function formatStrengthLevelSummary(row: StrengthDisplayInput): string {
  const isBodyweight = row.exerciseEquipment === 'BODYWEIGHT';

  if (isBodyweight) {
    const parts: string[] = [];
    if (row.maxReps != null && row.maxReps > 0) {
      parts.push(`最多 ${row.maxReps} 次`);
    }
    if (row.loadAdjustmentKg != null && row.loadAdjustmentKg !== 0) {
      parts.push(formatLoadAdjustment(row.loadAdjustmentKg));
    }
    return parts.length > 0 ? parts.join(' · ') : '未填写';
  }

  const parts: string[] = [];
  if (row.oneRm != null && row.oneRm > 0) {
    parts.push(`极限 ${formatKg(row.oneRm)} kg`);
  }
  if (row.workingWeightKg != null && row.workingWeightKg > 0) {
    parts.push(`做组 ${formatKg(row.workingWeightKg)} kg`);
  }
  return parts.length > 0 ? parts.join(' · ') : '未填写重量';
}

export function isBodyweightEquipment(equipment?: ExerciseEquipment | null): boolean {
  return equipment === 'BODYWEIGHT';
}

/** 将 UI 上的辅助/负重字段转为有符号 loadAdjustmentKg */
export function toLoadAdjustmentKg(assistKg: number | null, addedKg: number | null): number | null {
  if (addedKg != null && addedKg > 0) return addedKg;
  if (assistKg != null && assistKg > 0) return -assistKg;
  return null;
}

export function fromLoadAdjustmentKg(loadAdjustmentKg?: number | null): {
  assistKg: number | null;
  addedKg: number | null;
} {
  if (loadAdjustmentKg == null || loadAdjustmentKg === 0) {
    return { assistKg: null, addedKg: null };
  }
  if (loadAdjustmentKg < 0) {
    return { assistKg: Math.abs(loadAdjustmentKg), addedKg: null };
  }
  return { assistKg: null, addedKg: loadAdjustmentKg };
}
