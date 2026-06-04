import {
  ConversationListResponseSchema,
  ConversationWithMessagesSchema,
  CoachMessageAcceptedResponseSchema,
  CoachStreamAcceptedEventSchema,
  CoachStreamDeltaEventSchema,
  CoachStreamDoneEventSchema,
  CreateCoachMessageSchema,
  CreateConversationSchema,
  type CreateCoachMessageInput,
  type CreateConversationInput,
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

import {
  AI_POLL_INTERVAL_MS,
  AI_POLL_TIMEOUT_MS,
  AI_POLL_TIMEOUT_PLAN_MS,
  DEFAULT_TIMEZONE_OFFSET_MINUTES,
} from '../../env';

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
    mutationFn: async (params: { conversationId: string; content: string }) => {
      const body = CreateCoachMessageSchema.parse({
        action: 'CHAT',

        content: params.content,

        timezoneOffsetMinutes: DEFAULT_TIMEZONE_OFFSET_MINUTES,
      });

      const streamStore = useCoachStreamStore.getState();

      streamStore.reset();

      await apiStreamSSE(
        `/conversations/${params.conversationId}/messages/stream`,

        body,

        (event, data) => {
          if (event === 'accepted') {
            const parsed = CoachStreamAcceptedEventSchema.parse(data);

            streamStore.startStream({
              userMessageId: parsed.userMessageId,

              userContent: params.content,

              assistantMessageId: parsed.pendingAssistantMessageId,
            });
          } else if (event === 'delta') {
            const parsed = CoachStreamDeltaEventSchema.parse(data);

            streamStore.setAssistantContent(parsed.text);
          } else if (event === 'done') {
            const parsed = CoachStreamDoneEventSchema.parse(data);

            streamStore.setAssistantContent(useCoachStreamStore.getState().assistantContent || '');

            streamStore.finishStream({
              suggestedActions: parsed.suggestedActions ?? undefined,
            });
          }
        },

        { timeoutMs: AI_POLL_TIMEOUT_MS },
      );
    },

    onSuccess: async (_data, variables) => {
      await qc.refetchQueries({
        queryKey: queryKeys.coachConversation(variables.conversationId),
      });
      useCoachStreamStore.getState().reset();
      void qc.invalidateQueries({ queryKey: queryKeys.coachConversations });
      void qc.invalidateQueries({ queryKey: queryKeys.mealLogs() });
      void qc.invalidateQueries({ queryKey: queryKeys.plans('WORKOUT') });
      void qc.invalidateQueries({ queryKey: queryKeys.plans('MEAL') });
      void qc.invalidateQueries({ queryKey: ['daily-summary'] });
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

      useCoachStreamStore.getState().failStream(err.message);
    },
  });
}

export function abortCoachChatStream(): void {
  abortActiveSseStream();
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
