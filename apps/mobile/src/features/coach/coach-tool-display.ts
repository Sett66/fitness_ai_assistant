import type { CoachToolActivity } from './coach-stream-store';

const DONE_VISIBLE_MS = 2000;

/** 流式阶段助手气泡占位：工具进行中 / 整理回复，避免只显示「思考中…」 */
export function getAssistantPlaceholder(
  activities: CoachToolActivity[],
  isStreaming: boolean,
): string | undefined {
  if (!isStreaming || activities.length === 0) {
    return undefined;
  }

  const running = activities.find((item) => item.status === 'running');
  if (running) {
    return running.label;
  }

  const hasTools = activities.length > 0;
  const allSettled = activities.every((item) => item.status === 'done' || item.status === 'failed');
  if (hasTools && allSettled) {
    return '正在整理回复…';
  }

  return undefined;
}

export type CoachToolActivityRow = CoachToolActivity & { rowKey: string };

/** 工具条可见行：含短暂「完成」与整理回复占位 */
export function getVisibleToolActivities(
  activities: CoachToolActivity[],
  isStreaming: boolean,
  hasAssistantContent: boolean,
  now = Date.now(),
): CoachToolActivityRow[] {
  const rows: CoachToolActivityRow[] = [];

  for (const item of activities) {
    if (item.status === 'running' || item.status === 'failed') {
      rows.push({ ...item, rowKey: `${item.name}-${item.status}` });
      continue;
    }
    if (item.status === 'done' && item.endedAt != null && now - item.endedAt < DONE_VISIBLE_MS) {
      rows.push({ ...item, rowKey: `${item.name}-done-${item.endedAt}` });
    }
  }

  const waitingForReply =
    isStreaming &&
    !hasAssistantContent &&
    activities.length > 0 &&
    activities.every((item) => item.status === 'done' || item.status === 'failed') &&
    !activities.some((item) => item.status === 'running') &&
    !rows.some(
      (item) =>
        item.status === 'done' && item.endedAt != null && now - item.endedAt < DONE_VISIBLE_MS,
    );

  if (waitingForReply) {
    rows.push({
      name: activities[activities.length - 1]!.name,
      label: '正在整理回复…',
      status: 'running',
      rowKey: 'reply-pending',
    });
  }

  return rows;
}
