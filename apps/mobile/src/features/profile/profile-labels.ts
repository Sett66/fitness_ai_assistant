import type { Gender, Goal } from '@fitness/shared';
import { ageFromBirthDate, termsZhCN } from '@fitness/shared';

export function genderLabel(gender: Gender): string {
  const map: Record<Gender, string> = {
    MALE: termsZhCN.GENDER_MALE ?? '男',
    FEMALE: termsZhCN.GENDER_FEMALE ?? '女',
    OTHER: termsZhCN.GENDER_OTHER ?? '其他',
  };
  return map[gender];
}

export function goalLabel(goal: Goal): string {
  const map: Record<Goal, string> = {
    MUSCLE_GAIN: termsZhCN.GOAL_MUSCLE_GAIN ?? '增肌',
    FAT_LOSS: termsZhCN.GOAL_FAT_LOSS ?? '减脂',
    MAINTAIN: termsZhCN.GOAL_MAINTAIN ?? '维持',
  };
  return map[goal];
}

export function ageLabel(birthDate: string | Date): string {
  const d = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  return `${ageFromBirthDate(d)} 岁`;
}

export function trainingYearsLabel(years: number): string {
  if (years <= 0) return '未填写';
  return `${years} 年`;
}
