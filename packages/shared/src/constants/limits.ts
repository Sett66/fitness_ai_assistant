/** 单用户每日 AI 任务上限（PRD §7；ADR 0007 按类型拆分） */
export const AI_TASK_DAILY_LIMIT_PER_USER = 5;

export const AI_TASK_DAILY_LIMITS: Readonly<Partial<Record<string, number>>> = {
  COACH_CHAT: 30,
  MEMORY_EXTRACT: 30,
  PLAN_GENERATE_WORKOUT: 2,
  PLAN_GENERATE_MEAL: 2,
  MEAL_VISION: 10,
  MESOCYCLE_REVIEW: 2,
  REPORT_ANALYZE: 3,
};

/** 长期记忆异步抽取日限（与 COACH_CHAT 同量级，防刷） */
export const MEMORY_EXTRACT_DAILY_LIMIT = AI_TASK_DAILY_LIMITS.MEMORY_EXTRACT ?? 30;

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

// ============================== 滑块验证 / 短信验证码 ==============================

/** 滑块拼图挑战有效期 */
export const CAPTCHA_CHALLENGE_TTL_SEC = 120;

/** 滑块校验通过后签发的一次性 token 有效期 */
export const CAPTCHA_TOKEN_TTL_SEC = 300;

/** 滑块缺口对齐容差（像素） */
export const CAPTCHA_TOLERANCE_PX = 6;

/** 滑块画板尺寸与拼图块尺寸（前后端共用，保证坐标系一致） */
export const CAPTCHA_BOARD_WIDTH = 300;
export const CAPTCHA_BOARD_HEIGHT = 180;
export const CAPTCHA_PIECE_SIZE = 50;

/** 短信验证码有效期 */
export const SMS_CODE_TTL_SEC = 300;

/** 同一手机号+场景发送验证码的冷却间隔 */
export const SMS_CODE_COOLDOWN_SEC = 60;

/** 单条验证码最大校验尝试次数 */
export const SMS_CODE_MAX_ATTEMPTS = 5;
