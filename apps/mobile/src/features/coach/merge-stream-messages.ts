import type { Message } from '@fitness/shared';

import type { useCoachStreamStore } from './coach-stream-store';

type StreamSnapshot = Pick<
  ReturnType<typeof useCoachStreamStore.getState>,
  | 'isStreaming'
  | 'userMessageId'
  | 'userContent'
  | 'assistantMessageId'
  | 'assistantContent'
  | 'suggestedActions'
>;

export function mergeStreamMessages(messages: Message[], stream: StreamSnapshot): Message[] {
  const hasStreamOverlay =
    stream.isStreaming ||
    stream.userMessageId != null ||
    (stream.assistantMessageId != null && stream.assistantContent.length > 0);
  if (!hasStreamOverlay) {
    return messages;
  }

  const result = [...messages];
  const now = new Date();

  if (stream.userMessageId && stream.userContent) {
    const userIdx = result.findIndex((m) => m.id === stream.userMessageId);
    if (userIdx < 0) {
      result.push({
        id: stream.userMessageId,
        conversationId: result[0]?.conversationId ?? '',
        role: 'USER',
        contentType: 'TEXT',
        content: stream.userContent,
        metadata: { action: 'CHAT' },
        createdAt: now,
      });
    }
  }

  if (stream.assistantMessageId) {
    const assistantIdx = result.findIndex((m) => m.id === stream.assistantMessageId);
    const existingAssistant = assistantIdx >= 0 ? result[assistantIdx] : undefined;
    const assistantContent = stream.assistantContent || existingAssistant?.content || '思考中…';
    const metadata: Record<string, unknown> = {
      taskStatus: stream.isStreaming ? 'RUNNING' : 'DONE',
      taskType: 'COACH_CHAT',
      action: 'CHAT',
    };
    if (stream.suggestedActions?.length) {
      metadata.suggestedActions = stream.suggestedActions;
    }

    const assistantMessage: Message = {
      id: stream.assistantMessageId,
      conversationId: result[0]?.conversationId ?? '',
      role: 'ASSISTANT',
      contentType: stream.assistantContent ? 'TEXT' : 'SYSTEM_NOTICE',
      content: assistantContent,
      metadata,
      createdAt: existingAssistant?.createdAt ?? now,
    };

    if (assistantIdx >= 0) {
      result[assistantIdx] = { ...result[assistantIdx], ...assistantMessage };
    } else {
      result.push(assistantMessage);
    }
  }

  return result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}
