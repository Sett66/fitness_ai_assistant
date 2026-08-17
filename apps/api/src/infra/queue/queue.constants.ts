/** BullMQ 队列名：HTTP 投递与 Worker 消费必须一致 */
export const AI_TASK_QUEUE_NAME = 'fitness-ai-task';

/** 默认 AI 任务 job（关联 AiRun） */
export const AI_TASK_JOB_NAME = 'default';

/**
 * 长期记忆抽取 job（复用 AI_TASK_QUEUE，低优先级后台任务，见 AGENT-05）
 * payload 仍为 { aiRunId }，具体字段存于 AiRun.inputJson
 */
export const MEMORY_EXTRACT_JOB_NAME = 'memory_extract';

export type AiTaskJobPayload = {
  aiRunId: string;
};

/** 社区检索索引同步（ADR 0011 §10；与 AI 任务队列隔离） */
export const SOCIAL_INDEX_QUEUE_NAME = 'fitness-social-index';
export const SOCIAL_INDEX_JOB_NAME = 'default';

export type SocialIndexJobPayload =
  | { op: 'INDEX_POST'; id: string }
  | { op: 'DELETE_POST'; id: string }
  | { op: 'INDEX_USER'; id: string };

export const SOCIAL_INDEX_JOB_OPTIONS = {
  attempts: 8,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: true,
  removeOnFail: false,
};
