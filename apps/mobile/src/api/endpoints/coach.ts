import {
  ConversationListResponseSchema,
  ConversationWithMessagesSchema,
  CoachMessageAcceptedResponseSchema,
  CoachStreamAcceptedEventSchema,
  CoachStreamDeltaEventSchema,
  CoachStreamDoneEventSchema,
  CoachStreamToolEndEventSchema,
  CoachStreamToolStartEventSchema,
  CreateCoachMessageSchema,
  CreateConversationSchema,
  type ConversationWithMessages,
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

import { resolveLocationContextForChat } from '../../features/location';
import { coachToolProgressLabel } from '../../features/coach/coach-tool-labels';
import type { CoachDraftAttachment } from '../../features/coach/coach-draft-attachments';
import { pollRunningConversationTasks } from '../../features/coach/poll-conversation-tasks';

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
    mutationFn: async (params: {
      conversationId: string;
      content: string;
      draftImages?: CoachDraftAttachment[];
    }) => {
      let imageObjectKeys: string[] | undefined;
      if (params.draftImages?.length) {
        imageObjectKeys = await Promise.all(
          params.draftImages.map((asset) =>
            uploadMealPhotoForCoach(asset.uri, asset.mime, asset.sizeBytes),
          ),
        );
      }

      const locationContext = await resolveLocationContextForChat(params.content);

      const body = CreateCoachMessageSchema.parse({
        action: 'CHAT',
        content: params.content.trim() || undefined,
        imageObjectKeys,
        timezoneOffsetMinutes: DEFAULT_TIMEZONE_OFFSET_MINUTES,
        locationContext,
      });

      const streamStore = useCoachStreamStore.getState();
      streamStore.reset();

      const displayUserContent =
        params.content.trim() ||
        (params.draftImages?.length === 1
          ? '[图片]'
          : `[${params.draftImages?.length ?? 0} 张图片]`);

      await apiStreamSSE(
        `/conversations/${params.conversationId}/messages/stream`,
        body,
        (event, data) => {
          if (event === 'accepted') {
            const parsed = CoachStreamAcceptedEventSchema.parse(data);

            streamStore.startStream({
              userMessageId: parsed.userMessageId,
              userContent: displayUserContent,
              assistantMessageId: parsed.pendingAssistantMessageId,
              userImageObjectKeys: imageObjectKeys,
              userImagePreviewUris: params.draftImages?.map((asset) => asset.uri),
            });
          } else if (event === 'delta') {
            const parsed = CoachStreamDeltaEventSchema.parse(data);

            streamStore.setAssistantContent(parsed.text);
          } else if (event === 'tool_start') {
            const parsed = CoachStreamToolStartEventSchema.parse(data);
            streamStore.startTool({
              name: parsed.name,
              label: coachToolProgressLabel(parsed.name, parsed.label),
            });
          } else if (event === 'tool_end') {
            const parsed = CoachStreamToolEndEventSchema.parse(data);
            streamStore.endTool({
              name: parsed.name,
              ok: parsed.ok,
              summary: parsed.summary,
            });
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
