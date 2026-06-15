import type { Message } from '@fitness/shared';

import { findRunningBackgroundTaskMessages } from './poll-conversation-tasks';

const baseMessage = (overrides: Partial<Message>): Message => ({
  id: 'msg-1',
  conversationId: 'conv-1',
  role: 'ASSISTANT',
  contentType: 'SYSTEM_NOTICE',
  content: '正在生成训练计划…',
  metadata: {},
  createdAt: new Date(),
  ...overrides,
});

describe('findRunningBackgroundTaskMessages', () => {
  it('包含 RUNNING 的计划/识图任务', () => {
    const messages = [
      baseMessage({
        aiRunId: 'run-1',
        metadata: { taskStatus: 'RUNNING', action: 'GENERATE_WORKOUT' },
      }),
      baseMessage({
        id: 'msg-2',
        contentType: 'TEXT',
        content: '好的，已提交',
        metadata: { taskStatus: 'DONE', action: 'CHAT' },
      }),
    ];

    expect(findRunningBackgroundTaskMessages(messages)).toHaveLength(1);
    expect(findRunningBackgroundTaskMessages(messages)[0]?.aiRunId).toBe('run-1');
  });

  it('忽略已完成或非重任务消息', () => {
    const messages = [
      baseMessage({
        aiRunId: 'run-1',
        contentType: 'PLAN_CARD',
        metadata: { taskStatus: 'DONE', action: 'GENERATE_WORKOUT' },
      }),
      baseMessage({
        aiRunId: 'run-2',
        metadata: { taskStatus: 'RUNNING', action: 'CHAT' },
      }),
    ];

    expect(findRunningBackgroundTaskMessages(messages)).toHaveLength(0);
  });
});
