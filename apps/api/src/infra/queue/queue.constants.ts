/** BullMQ 队列名：HTTP 投递与 Worker 消费必须一致 */
export const AI_TASK_QUEUE_NAME = 'fitness-ai-task';

export type AiTaskJobPayload = {
  aiRunId: string;
};
