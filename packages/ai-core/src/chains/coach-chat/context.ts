import type { UserAiContext } from '@fitness/shared';
import { LLM_MODELS } from '@fitness/shared';

function summarizeContext(ctx: UserAiContext): string {
  const parts: string[] = [];
  if (ctx.profile) {
    const p = ctx.profile;
    parts.push(
      `档案：${p.gender}，身高 ${p.heightCm}cm，体重 ${p.weightKg}kg，训练 ${p.trainingYears} 年，目标 ${p.goal}`,
    );
  } else {
    parts.push('档案：未完善');
  }
  if (ctx.strengthLevels.length > 0) {
    const top = ctx.strengthLevels
      .slice(0, 5)
      .map((s) => `${s.exerciseName} 1RM ${s.oneRm ?? '?'}kg`)
      .join('；');
    parts.push(`力量：${top}`);
  }
  if (ctx.activeWorkoutPlan) {
    parts.push(`活跃训练计划：${ctx.activeWorkoutPlan.summary}`);
  }
  if (ctx.activeMealPlan) {
    parts.push(`活跃饮食计划：${ctx.activeMealPlan.summary}`);
  }
  if (ctx.todayNutrition) {
    const n = ctx.todayNutrition;
    parts.push(
      `今日营养：目标 ${n.targetKcal} kcal，已摄入 ${n.consumedKcal} kcal，剩余 ${n.remainingKcal} kcal`,
    );
  }
  return parts.join('\n');
}

export function buildCoachContextBlock(ctx: UserAiContext): string {
  return summarizeContext(ctx);
}

export const defaultCoachModel = LLM_MODELS.DEEPSEEK_V4_PRO;
