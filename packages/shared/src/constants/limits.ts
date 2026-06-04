/** 单用户每日 AI 任务上限（PRD §7；ADR 0007 按类型拆分） */
export const AI_TASK_DAILY_LIMIT_PER_USER = 5;

export const AI_TASK_DAILY_LIMITS: Readonly<Partial<Record<string, number>>> = {
  COACH_CHAT: 30,
  PLAN_GENERATE_WORKOUT: 2,
  PLAN_GENERATE_MEAL: 2,
  MEAL_VISION: 10,
  MESOCYCLE_REVIEW: 2,
  REPORT_ANALYZE: 2,
};

export function getAiTaskDailyLimit(taskType: string): number {
  return AI_TASK_DAILY_LIMITS[taskType] ?? AI_TASK_DAILY_LIMIT_PER_USER;
}

/** AI 任务 worker 最大重试次数（PRD §5.3、ARCH §5） */
export const AI_TASK_MAX_RETRIES = 3;

/** 客户端轮询 AI 任务的指数退避序列（ARCH §5） */
export const AI_TASK_POLL_BACKOFF_MS = [1000, 2000, 4000, 8000] as const;

/** 媒体单文件大小上限：50 MB */
export const MEDIA_MAX_SIZE_BYTES = 50 * 1024 * 1024;

/** access token TTL（ARCH §7：15 分钟） */
export const ACCESS_TOKEN_TTL_SEC = 15 * 60;

/** refresh token TTL（ARCH §7：30 天） */
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;
