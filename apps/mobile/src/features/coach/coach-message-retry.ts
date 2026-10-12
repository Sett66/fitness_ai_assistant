import { COACH_MESSAGE_DELIVERY_FAILED, type Message } from '@fitness/shared';

function metaOf(message: Message): Record<string, unknown> {
  return (message.metadata ?? {}) as Record<string, unknown>;
}

export function isFailedDelivery(message: Message): boolean {
  return (
    message.role === 'USER' && metaOf(message).deliveryStatus === COACH_MESSAGE_DELIVERY_FAILED
  );
}

/** 仅当失败的 CHAT 用户消息之后没有其他用户消息时才可重试（否则它已被上下文永久忽略） */
export function isRetryableFailedMessage(messages: Message[], message: Message): boolean {
  if (!isFailedDelivery(message) || metaOf(message).action !== 'CHAT') return false;
  const createdAt = new Date(message.createdAt).getTime();
  return !messages.some(
    (other) =>
      other.id !== message.id &&
      other.role === 'USER' &&
      new Date(other.createdAt).getTime() > createdAt,
  );
}

export function extractCoachImageObjectKeys(message: Message): string[] {
  const keys = metaOf(message).imageObjectKeys;
  return Array.isArray(keys) ? keys.filter((key): key is string => typeof key === 'string') : [];
}

/** 重试乐观更新：清除用户消息的失败标记，并移除其后的失败助手提示 */
export function clearFailedDelivery(messages: Message[], messageId: string): Message[] {
  const target = messages.find((message) => message.id === messageId);
  if (!target) return messages;
  const createdAt = new Date(target.createdAt).getTime();
  return messages
    .filter(
      (message) =>
        !(
          message.role === 'ASSISTANT' &&
          new Date(message.createdAt).getTime() > createdAt &&
          metaOf(message).taskStatus === 'FAILED'
        ),
    )
    .map((message) => {
      if (message.id !== messageId) return message;
      const { deliveryStatus: _status, failureReason: _reason, ...rest } = metaOf(message);
      return { ...message, metadata: rest };
    });
}
