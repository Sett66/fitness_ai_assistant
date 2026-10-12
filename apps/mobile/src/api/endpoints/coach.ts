import {
  ConversationListResponseSchema,
  ConversationWithMessagesSchema,
  CoachMessageAcceptedResponseSchema,
  CoachStreamCancelledEventSchema,
  CoachStreamDeltaEventSchema,
  CoachStreamDoneEventSchema,
  CoachStreamErrorEventSchema,
  CoachStreamStartResponseSchema,
  CoachStreamToolEndEventSchema,
  CoachStreamToolStartEventSchema,
  CreateCoachMessageSchema,
  StartCoachStreamSchema,
  CreateConversationSchema,
  RetryCoachMessageSchema,
  isCoachImagePlaceholderContent,
  type ConversationWithMessages,
  type CreateCoachMessageInput,
  type CreateConversationInput,
  type Message,
} from '@fitness/shared';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useCoachStreamStore } from '../../features/coach/coach-stream-store';

import {
  abortActiveSseStream,
  ApiError,
  apiFetch,
  apiStreamSSE,
  pollAiTask,
  uploadToPresignedUrl,
} from '../client';

import { presignRequestBody } from './media';

import { queryKeys } from '../queryKeys';

import { resolveLocationContextForChat } from '../../features/location';
import { coachToolProgressLabel } from '../../features/coach/coach-tool-labels';
import { createCoachDeltaThrottle } from '../../features/coach/coach-stream-delta-throttle';
import type { CoachDraftAttachment } from '../../features/coach/coach-draft-attachments';
import { pollRunningConversationTasks } from '../../features/coach/poll-conversation-tasks';
import {
  clearFailedDelivery,
  extractCoachImageObjectKeys,
} from '../../features/coach/coach-message-retry';

import {
  AI_POLL_INTERVAL_MS,
  AI_POLL_TIMEOUT_MS,
  AI_POLL_TIMEOUT_PLAN_MS,
  DEFAULT_TIMEZONE_OFFSET_MINUTES,
} from '../../env';

let activeCoachStream: { conversationId: string; streamId: string } | null = null;
let streamSubscriptionGeneration = 0;

function createClientRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
  });
}

const reconnectDelays = [500, 1000, 2000, 4000, 8000, 16000];

async function startCoachStream(
  conversationId: string,
  body: unknown,
  retryMessageId?: string,
): Promise<unknown> {
  const path = retryMessageId
    ? `/conversations/${conversationId}/messages/${retryMessageId}/retry`
    : `/conversations/${conversationId}/messages/stream`;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await apiFetch<unknown>(path, { method: 'POST', body });
    } catch (err) {
      const retryable = !(err instanceof ApiError) || err.status === 0 || err.status >= 500;
      if (!retryable || attempt >= 2) throw err;
      await new Promise<void>((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}

async function subscribeCoachStream(
  conversationId: string,
  streamId: string,
  deltaThrottle: ReturnType<typeof createCoachDeltaThrottle>,
): Promise<void> {
  const store = useCoachStreamStore.getState();
  const subscriptionGeneration = streamSubscriptionGeneration;
  activeCoachStream = { conversationId, streamId };
  let terminal = false;
  let retryCount = 0;

  while (!terminal && subscriptionGeneration === streamSubscriptionGeneration) {
    let receivedBusinessEvent = false;
    try {
      await apiStreamSSE(
        `/conversations/${conversationId}/message-streams/${streamId}`,
        (event, data) => {
          if (event === 'ping') return;
          if (event === 'delta') {
            const parsed = CoachStreamDeltaEventSchema.parse(data);
            if (store.acceptSequence(parsed.sequence)) {
              receivedBusinessEvent = true;
              deltaThrottle.push(parsed.text);
            }
          } else if (event === 'tool_start') {
            const parsed = CoachStreamToolStartEventSchema.parse(data);
            if (store.acceptSequence(parsed.sequence)) {
              receivedBusinessEvent = true;
              store.startTool({
                name: parsed.name,
                label: coachToolProgressLabel(parsed.name, parsed.label),
              });
            }
          } else if (event === 'tool_end') {
            const parsed = CoachStreamToolEndEventSchema.parse(data);
            if (store.acceptSequence(parsed.sequence)) {
              receivedBusinessEvent = true;
              store.endTool({ name: parsed.name, ok: parsed.ok, summary: parsed.summary });
            }
          } else if (event === 'done') {
            const parsed = CoachStreamDoneEventSchema.parse(data);
            if (!store.acceptSequence(parsed.sequence)) return;
            receivedBusinessEvent = true;
            deltaThrottle.flush();
            if (useCoachStreamStore.getState().assistantContent !== parsed.finalText) {
              useCoachStreamStore.getState().correctAssistantContent(parsed.finalText);
            }
            useCoachStreamStore.getState().finishStream({
              suggestedActions: parsed.suggestedActions ?? undefined,
            });
            terminal = true;
          } else if (event === 'cancelled') {
            const parsed = CoachStreamCancelledEventSchema.parse(data);
            if (!store.acceptSequence(parsed.sequence)) return;
            receivedBusinessEvent = true;
            deltaThrottle.flush();
            if (useCoachStreamStore.getState().assistantContent !== parsed.finalText) {
              useCoachStreamStore.getState().correctAssistantContent(parsed.finalText);
            }
            useCoachStreamStore.getState().stopStream();
            terminal = true;
          } else if (event === 'error') {
            const parsed = CoachStreamErrorEventSchema.parse(data);
            if (!store.acceptSequence(parsed.sequence)) return;
            receivedBusinessEvent = true;
            deltaThrottle.dispose();
            useCoachStreamStore.getState().failStream(parsed.message);
            terminal = true;
          }
        },
        {
          timeoutMs: 100_000,
          afterSequence: useCoachStreamStore.getState().lastProcessedSequence,
        },
      );
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === 'STREAM_ABORTED' || err.code === 'STREAM_UNSUBSCRIBED')
      ) {
        throw err;
      }
      if (subscriptionGeneration !== streamSubscriptionGeneration) {
        throw new ApiError('流式订阅已断开', 0, 'STREAM_UNSUBSCRIBED');
      }
      const retryable = err instanceof ApiError && (err.status === 0 || err.status >= 500);
      if (!retryable) throw err;
    }

    if (terminal) break;
    if (receivedBusinessEvent) retryCount = 0;
    if (retryCount >= reconnectDelays.length) {
      useCoachStreamStore.getState().setReconnectRequired();
      throw new ApiError('连接中断，可点击重新连接', 0, 'STREAM_RECONNECT_REQUIRED');
    }
    await new Promise<void>((resolve) => setTimeout(resolve, reconnectDelays[retryCount]!));
    if (subscriptionGeneration !== streamSubscriptionGeneration) {
      throw new ApiError('流式订阅已断开', 0, 'STREAM_UNSUBSCRIBED');
    }
    retryCount += 1;
  }

  activeCoachStream = null;
}

export async function fetchConversationsList() {
  const json = await apiFetch<unknown>('/conversations', { noCache: true });
  return ConversationListResponseSchema.parse(json);
}

export function useConversationsList(enabled = true) {
  return useQuery({
    queryKey: queryKeys.coachConversations,
    queryFn: fetchConversationsList,
    enabled,
  });
}

export function useCreateConversation() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (body?: CreateConversationInput) => {
      const parsed = CreateConversationSchema.parse(body ?? {});

      const json = await apiFetch<unknown>('/conversations', {
        method: 'POST',

        body: parsed,
      });

      return ConversationWithMessagesSchema.parse(json);
    },

    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.coachConversations });
    },
  });
}

export function useCoachConversation(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.coachConversation(conversationId ?? ''),

    queryFn: async () => {
      const json = await apiFetch<unknown>(`/conversations/${conversationId}`, { noCache: true });

      return ConversationWithMessagesSchema.parse(json);
    },

    enabled: Boolean(conversationId),
  });
}

function invalidateCoachQueries(
  qc: ReturnType<typeof useQueryClient>,

  conversationId: string,
) {
  void qc.invalidateQueries({ queryKey: queryKeys.coachConversation(conversationId) });

  void qc.invalidateQueries({ queryKey: queryKeys.coachConversations });

  void qc.invalidateQueries({ queryKey: queryKeys.mealLogs() });

  void qc.invalidateQueries({ queryKey: queryKeys.plans('WORKOUT') });

  void qc.invalidateQueries({ queryKey: queryKeys.plans('MEAL') });

  void qc.invalidateQueries({ queryKey: ['daily-summary'] });
}

export function useSendCoachChatStream() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      conversationId: string;
      content: string;
      draftImages?: CoachDraftAttachment[];
      /** 原地重试的失败用户消息（复用其文字与已上传图片） */
      retryMessage?: Message;
    }) => {
      const operationGeneration = streamSubscriptionGeneration;
      const streamStore = useCoachStreamStore.getState();
      streamStore.reset();

      const retryMessage = params.retryMessage;
      const retryImageKeys = retryMessage ? extractCoachImageObjectKeys(retryMessage) : [];
      const displayUserContent = retryMessage
        ? retryMessage.content
        : params.content.trim() ||
          (params.draftImages?.length === 1
            ? '[图片]'
            : `[${params.draftImages?.length ?? 0} 张图片]`);

      if (retryMessage) {
        markRetryingInCache(qc, params.conversationId, retryMessage.id);
      }

      // 立即乐观展示用户气泡与「思考中」占位，避免上传/定位等待期间界面空白
      streamStore.beginUserMessage({
        userContent: displayUserContent,
        userImagePreviewUris: params.draftImages?.map((asset) => asset.uri),
        userMessageId: retryMessage?.id,
      });

      let imageObjectKeys: string[] | undefined = retryMessage ? retryImageKeys : undefined;
      if (!retryMessage && params.draftImages?.length) {
        imageObjectKeys = await Promise.all(
          params.draftImages.map(
            (asset) =>
              asset.objectKey ?? uploadMealPhotoForCoach(asset.uri, asset.mime, asset.sizeBytes),
          ),
        );
      }

      const locationText = retryMessage
        ? isCoachImagePlaceholderContent(retryMessage.content)
          ? ''
          : retryMessage.content
        : params.content;
      const locationContext = await resolveLocationContextForChat(locationText);
      if (operationGeneration !== streamSubscriptionGeneration) {
        throw new ApiError('发送已取消', 0, 'STREAM_UNSUBSCRIBED');
      }

      const body = retryMessage
        ? RetryCoachMessageSchema.parse({
            clientRequestId: createClientRequestId(),
            timezoneOffsetMinutes: DEFAULT_TIMEZONE_OFFSET_MINUTES,
            locationContext,
          })
        : StartCoachStreamSchema.parse({
            action: 'CHAT',
            clientRequestId: createClientRequestId(),
            content: params.content.trim() || undefined,
            imageObjectKeys,
            timezoneOffsetMinutes: DEFAULT_TIMEZONE_OFFSET_MINUTES,
            locationContext,
          });

      const deltaThrottle = createCoachDeltaThrottle((text) => {
        streamStore.appendAssistantDelta(text);
      });
      let subscribedStreamId: string | null = null;

      try {
        let started;
        try {
          started = CoachStreamStartResponseSchema.parse(
            await startCoachStream(params.conversationId, body, retryMessage?.id),
          );
        } catch (err) {
          const existingStreamId =
            err instanceof ApiError && err.code === 'COACH_STREAM_ALREADY_RUNNING'
              ? err.details?.streamId
              : undefined;
          if (typeof existingStreamId !== 'string') throw err;
          if (operationGeneration !== streamSubscriptionGeneration)
            return { streamId: existingStreamId, detached: true };
          const currentConversation = ConversationWithMessagesSchema.parse(
            await apiFetch<unknown>(`/conversations/${params.conversationId}`, { noCache: true }),
          );
          const assistant = currentConversation.messages.find(
            (message) => message.role === 'ASSISTANT' && message.aiRunId === existingStreamId,
          );
          if (!assistant) throw err;
          const assistantIndex = currentConversation.messages.findIndex(
            (message) => message.id === assistant.id,
          );
          const previousUser = currentConversation.messages
            .slice(0, assistantIndex)
            .findLast((message) => message.role === 'USER');
          if (!previousUser) throw err;
          const imageKeys = (
            previousUser.metadata?.imageObjectKeys as unknown[] | undefined
          )?.filter((key): key is string => typeof key === 'string');
          streamStore.startStream({
            streamId: existingStreamId,
            userMessageId: previousUser.id,
            userContent: previousUser.content,
            assistantMessageId: assistant.id,
            userImageObjectKeys: imageKeys,
          });
          subscribedStreamId = existingStreamId;
          await subscribeCoachStream(params.conversationId, existingStreamId, deltaThrottle);
          return { streamId: existingStreamId, detached: false };
        }
        if (operationGeneration !== streamSubscriptionGeneration) {
          return { streamId: started.streamId, detached: true };
        }
        streamStore.startStream({
          streamId: started.streamId,
          userMessageId: started.userMessageId,
          userContent: displayUserContent,
          assistantMessageId: started.assistantMessageId,
          userImageObjectKeys: imageObjectKeys,
          userImagePreviewUris: params.draftImages?.map((asset) => asset.uri),
        });
        subscribedStreamId = started.streamId;
        await subscribeCoachStream(params.conversationId, started.streamId, deltaThrottle);
        return { streamId: started.streamId, detached: false };
      } catch (err) {
        if (
          err instanceof ApiError &&
          (err.code === 'STREAM_ABORTED' || err.code === 'STREAM_UNSUBSCRIBED')
        ) {
          if (useCoachStreamStore.getState().streamId === subscribedStreamId) {
            deltaThrottle.flush();
          }
        } else {
          deltaThrottle.dispose();
        }
        throw err;
      } finally {
        deltaThrottle.dispose();
      }
    },

    onSuccess: async (data, variables) => {
      await qc.refetchQueries({
        queryKey: queryKeys.coachConversation(variables.conversationId),
      });
      if (!data?.detached && useCoachStreamStore.getState().streamId === data?.streamId) {
        useCoachStreamStore.getState().reset();
      }

      const conversation = qc.getQueryData<ConversationWithMessages>(
        queryKeys.coachConversation(variables.conversationId),
      );

      try {
        await pollRunningConversationTasks(conversation?.messages ?? []);
      } catch {
        // 超时或失败仍刷新会话，展示服务端最新卡片/失败态
      }

      invalidateCoachQueries(qc, variables.conversationId);
    },

    onError: (err, variables) => {
      if (err instanceof ApiError && err.code === 'STREAM_ABORTED') {
        useCoachStreamStore.getState().stopStream();

        if (variables?.conversationId) {
          void qc.invalidateQueries({
            queryKey: queryKeys.coachConversation(variables.conversationId),
          });
        }

        return;
      }
      if (
        err instanceof ApiError &&
        (err.code === 'STREAM_UNSUBSCRIBED' || err.code === 'STREAM_RECONNECT_REQUIRED')
      ) {
        if (err.code === 'STREAM_RECONNECT_REQUIRED') {
          useCoachStreamStore.getState().setReconnectRequired();
        }
        return;
      }

      const store = useCoachStreamStore.getState();
      const streamStarted = store.streamId != null;
      const failedOverlayUserId = store.userMessageId;
      if (!streamStarted && !getCoachSendFailedMessageId(err)) {
        // 业务拒绝（次数上限等）/ 上传失败：不保留消息，由调用方提示并回填输入框
        rejectedBeforeStart.add(err);
        store.reset();
      } else {
        store.failStream(err.message);
      }
      if (variables?.conversationId) {
        void qc
          .refetchQueries({ queryKey: queryKeys.coachConversation(variables.conversationId) })
          .finally(() => {
            // 服务端已落库为 FAILED 的用户消息接管展示，移除本地覆盖层避免重复气泡
            if (
              !streamStarted &&
              useCoachStreamStore.getState().userMessageId === failedOverlayUserId
            ) {
              useCoachStreamStore.getState().reset();
            }
          });
      }
    },
  });
}

const rejectedBeforeStart = new WeakSet<object>();

/** 发送在流启动前被拒绝且未保留为失败消息（需提示并回填输入框）；仅在 mutate 级 onError 中可靠 */
export function isCoachSendRejected(err: unknown): boolean {
  return typeof err === 'object' && err !== null && rejectedBeforeStart.has(err);
}

/** 流启动前失败但服务端已保留为 FAILED 的用户消息 id */
export function getCoachSendFailedMessageId(err: unknown): string | undefined {
  if (!(err instanceof ApiError)) return undefined;
  const id = err.details?.failedUserMessageId;
  return typeof id === 'string' ? id : undefined;
}

function markRetryingInCache(
  qc: ReturnType<typeof useQueryClient>,
  conversationId: string,
  messageId: string,
) {
  qc.setQueryData<ConversationWithMessages>(queryKeys.coachConversation(conversationId), (prev) =>
    prev ? { ...prev, messages: clearFailedDelivery(prev.messages, messageId) } : prev,
  );
}

export async function abortCoachChatStream(): Promise<string | undefined> {
  const stream = activeCoachStream;
  if (stream) {
    const result = await apiFetch<{ streamId: string; status: string }>(
      `/conversations/${stream.conversationId}/message-streams/${stream.streamId}/cancel`,
      {
        method: 'POST',
        body: {},
      },
    );
    if (result.status === 'CANCELLED') useCoachStreamStore.getState().stopStream();
    return result.status;
  }
  return undefined;
}

export function unsubscribeCoachChatStream(): void {
  streamSubscriptionGeneration += 1;
  abortActiveSseStream('STREAM_UNSUBSCRIBED');
}

export async function reconnectCoachChatStream(): Promise<void> {
  const stream = activeCoachStream;
  const state = useCoachStreamStore.getState();
  if (!stream || !state.streamId || state.streamId !== stream.streamId) return;
  state.clearReconnectRequired();
  const throttle = createCoachDeltaThrottle((text) => {
    useCoachStreamStore.getState().appendAssistantDelta(text);
  });
  try {
    await subscribeCoachStream(stream.conversationId, stream.streamId, throttle);
  } finally {
    if (useCoachStreamStore.getState().streamId === stream.streamId) throttle.flush();
    throttle.dispose();
  }
}

export async function resumeCoachMessageStream(params: {
  conversationId: string;
  streamId: string;
  userMessageId: string;
  assistantMessageId: string;
  userContent: string;
  userImageObjectKeys?: string[];
}): Promise<void> {
  const current = useCoachStreamStore.getState();
  if (current.isStreaming && current.streamId === params.streamId) return;
  current.startStream(params);
  const throttle = createCoachDeltaThrottle((text) => {
    useCoachStreamStore.getState().appendAssistantDelta(text);
  });
  try {
    await subscribeCoachStream(params.conversationId, params.streamId, throttle);
  } finally {
    if (useCoachStreamStore.getState().streamId === params.streamId) throttle.flush();
    throttle.dispose();
  }
}

export function useSendCoachMessage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      conversationId: string;

      body: CreateCoachMessageInput;

      pollTimeoutMs?: number;
    }) => {
      const body = CreateCoachMessageSchema.parse({
        ...params.body,

        timezoneOffsetMinutes: DEFAULT_TIMEZONE_OFFSET_MINUTES,
      });

      const accepted = await apiFetch<unknown>(
        `/conversations/${params.conversationId}/messages`,

        { method: 'POST', body },
      );

      const parsed = CoachMessageAcceptedResponseSchema.parse(accepted);

      if (parsed.taskId) {
        await pollAiTask<unknown>(
          parsed.taskId,

          AI_POLL_INTERVAL_MS,

          params.pollTimeoutMs ?? AI_POLL_TIMEOUT_MS,
        );
      }

      return parsed;
    },

    onSuccess: (_data, variables) => {
      invalidateCoachQueries(qc, variables.conversationId);
    },
  });
}

async function uploadMediaForCoach(
  scope: 'MEAL_PHOTO' | 'REPORT',

  fileUri: string,

  mime: string,

  sizeBytes: number,
): Promise<string> {
  const signed = await apiFetch<{ uploadUrl: string; objectKey: string }>('/uploads/sign', {
    method: 'POST',

    body: presignRequestBody(scope, { mime, sizeBytes }),
  });

  await uploadToPresignedUrl(signed.uploadUrl, fileUri, mime);

  await apiFetch('/uploads/complete', {
    method: 'POST',

    body: { objectKey: signed.objectKey },
  });

  return signed.objectKey;
}

export async function uploadMealPhotoForCoach(
  fileUri: string,

  mime: string,

  sizeBytes: number,
): Promise<string> {
  return uploadMediaForCoach('MEAL_PHOTO', fileUri, mime, sizeBytes);
}

export async function uploadReportForCoach(
  fileUri: string,

  mime: string,

  sizeBytes: number,
): Promise<string> {
  return uploadMediaForCoach('REPORT', fileUri, mime, sizeBytes);
}

export function coachPollTimeoutForAction(action: CreateCoachMessageInput['action']): number {
  if (action === 'GENERATE_WORKOUT' || action === 'GENERATE_MEAL') {
    return AI_POLL_TIMEOUT_PLAN_MS;
  }

  return AI_POLL_TIMEOUT_MS;
}
