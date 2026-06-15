import type { Message } from '@fitness/shared';

import { pollAiTask } from '../../api/client';
import { AI_POLL_INTERVAL_MS, AI_POLL_TIMEOUT_MS, AI_POLL_TIMEOUT_PLAN_MS } from '../../env';

const BACKGROUND_ACTIONS = new Set(['GENERATE_WORKOUT', 'GENERATE_MEAL', 'MEAL_VISION']);

export function findRunningBackgroundTaskMessages(messages: Message[]): Message[] {
  return messages.filter((message) => {
    if (message.role !== 'ASSISTANT' || !message.aiRunId) {
      return false;
    }
    const meta = (message.metadata ?? {}) as Record<string, unknown>;
    if (meta.taskStatus !== 'RUNNING') {
      return false;
    }
    return typeof meta.action === 'string' && BACKGROUND_ACTIONS.has(meta.action);
  });
}

function pollTimeoutForAction(action: unknown): number {
  if (action === 'GENERATE_WORKOUT' || action === 'GENERATE_MEAL') {
    return AI_POLL_TIMEOUT_PLAN_MS;
  }
  return AI_POLL_TIMEOUT_MS;
}

/** Agent 流式对话内 enqueue 的重任务：轮询直至 Worker 完成并更新卡片消息 */
export async function pollRunningConversationTasks(messages: Message[]): Promise<void> {
  const running = findRunningBackgroundTaskMessages(messages);
  if (running.length === 0) {
    return;
  }

  await Promise.all(
    running.map((message) => {
      const action = (message.metadata as Record<string, unknown> | undefined)?.action;
      return pollAiTask(message.aiRunId!, AI_POLL_INTERVAL_MS, pollTimeoutForAction(action));
    }),
  );
}
