import type { Message } from '@fitness/shared';

import { clearFailedDelivery, isRetryableFailedMessage } from './coach-message-retry';

const at = (seconds: number) => new Date(2026, 0, 1, 0, 0, seconds);

const message = (overrides: Partial<Message>): Message => ({
  id: 'msg',
  conversationId: 'conv-1',
  role: 'USER',
  contentType: 'TEXT',
  content: '你好',
  metadata: { action: 'CHAT' },
  createdAt: at(0),
  ...overrides,
});

const failedUser = message({
  id: 'failed',
  createdAt: at(10),
  metadata: { action: 'CHAT', deliveryStatus: 'FAILED', failureReason: '流式服务暂不可用' },
});
const failedAssistant = message({
  id: 'failed-reply',
  role: 'ASSISTANT',
  contentType: 'SYSTEM_NOTICE',
  content: '回答生成失败',
  createdAt: at(11),
  metadata: { taskStatus: 'FAILED', taskType: 'COACH_CHAT' },
});

describe('isRetryableFailedMessage', () => {
  it('最后一条失败的用户消息可重试', () => {
    const messages = [message({ id: 'earlier' }), failedUser, failedAssistant];
    expect(isRetryableFailedMessage(messages, failedUser)).toBe(true);
  });

  it('之后已有其他用户消息时不可重试', () => {
    const messages = [failedUser, failedAssistant, message({ id: 'later', createdAt: at(20) })];
    expect(isRetryableFailedMessage(messages, failedUser)).toBe(false);
  });

  it('未失败的消息不可重试', () => {
    const normal = message({ id: 'ok', createdAt: at(30) });
    expect(isRetryableFailedMessage([normal], normal)).toBe(false);
  });
});

describe('clearFailedDelivery', () => {
  it('清除失败标记并移除其后的失败助手提示', () => {
    const result = clearFailedDelivery([failedUser, failedAssistant], 'failed');
    expect(result.map((item) => item.id)).toEqual(['failed']);
    expect(result[0]?.metadata).toEqual({ action: 'CHAT' });
  });
});
