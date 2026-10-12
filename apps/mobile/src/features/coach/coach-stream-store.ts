import type { CoachChatOutput, CoachToolName } from '@fitness/shared';
import { create } from 'zustand';

type SuggestedAction = NonNullable<CoachChatOutput['suggestedActions']>[number];

export type CoachToolActivity = {
  name: CoachToolName;
  label: string;
  status: 'running' | 'done' | 'failed';
  summary?: string;
  endedAt?: number;
};

type CoachStreamState = {
  isStreaming: boolean;
  streamRevision: number;
  streamId: string | null;
  lastProcessedSequence: number;
  userMessageId: string | null;
  userContent: string | null;
  userImageObjectKeys: string[] | null;
  userImagePreviewUris: string[] | null;
  assistantMessageId: string | null;
  assistantContent: string;
  suggestedActions: SuggestedAction[] | null;
  toolActivities: CoachToolActivity[];
  error: string | null;
  isCancelled: boolean;
  reconnectRequired: boolean;
  beginUserMessage: (params: { userContent: string; userImagePreviewUris?: string[] }) => void;
  startStream: (params: {
    streamId?: string;
    userMessageId: string;
    userContent: string;
    assistantMessageId: string;
    userImageObjectKeys?: string[];
    userImagePreviewUris?: string[];
  }) => void;
  appendAssistantDelta: (text: string) => void;
  correctAssistantContent: (content: string) => void;
  acceptSequence: (sequence: number) => boolean;
  setReconnectRequired: () => void;
  clearReconnectRequired: () => void;
  startTool: (params: { name: CoachToolName; label?: string }) => void;
  endTool: (params: { name: CoachToolName; ok: boolean; summary?: string }) => void;
  finishStream: (params: { suggestedActions?: SuggestedAction[] }) => void;
  failStream: (message: string) => void;
  stopStream: () => void;
  reset: () => void;
};

const initialState = {
  isStreaming: false,
  streamRevision: 0,
  streamId: null,
  lastProcessedSequence: 0,
  userMessageId: null,
  userContent: null,
  userImageObjectKeys: null,
  userImagePreviewUris: null,
  assistantMessageId: null,
  assistantContent: '',
  suggestedActions: null,
  toolActivities: [] as CoachToolActivity[],
  error: null,
  isCancelled: false,
  reconnectRequired: false,
};

export const useCoachStreamStore = create<CoachStreamState>((set) => ({
  ...initialState,
  beginUserMessage: ({ userContent, userImagePreviewUris }) => {
    const stamp = Date.now();
    set({
      ...initialState,
      isStreaming: true,
      userMessageId: `local-user-${stamp}`,
      userContent,
      userImagePreviewUris: userImagePreviewUris?.length ? userImagePreviewUris : null,
      assistantMessageId: `local-assistant-${stamp}`,
      assistantContent: '',
      toolActivities: [],
    });
  },
  startStream: ({
    streamId,
    userMessageId,
    userContent,
    assistantMessageId,
    userImageObjectKeys,
    userImagePreviewUris,
  }) =>
    set({
      ...initialState,
      isStreaming: true,
      streamId: streamId ?? null,
      userMessageId,
      userContent,
      userImageObjectKeys: userImageObjectKeys?.length ? userImageObjectKeys : null,
      userImagePreviewUris: userImagePreviewUris?.length ? userImagePreviewUris : null,
      assistantMessageId,
      assistantContent: '',
      toolActivities: [],
    }),
  appendAssistantDelta: (text) =>
    set((state) => ({
      assistantContent: state.assistantContent + text,
      streamRevision: state.streamRevision + 1,
    })),
  correctAssistantContent: (content) =>
    set((state) => ({
      assistantContent: content,
      streamRevision: state.streamRevision + 1,
    })),
  acceptSequence: (sequence) => {
    let accepted = false;
    set((state) => {
      if (sequence <= state.lastProcessedSequence) return state;
      accepted = true;
      return { lastProcessedSequence: sequence };
    });
    return accepted;
  },
  setReconnectRequired: () => set({ reconnectRequired: true, error: '连接中断，可点击重新连接' }),
  clearReconnectRequired: () => set({ reconnectRequired: false, error: null }),
  startTool: ({ name, label }) =>
    set((state) => ({
      toolActivities: [
        ...state.toolActivities.filter((item) => item.name !== name || item.status !== 'running'),
        {
          name,
          label: label ?? name,
          status: 'running',
        },
      ],
      streamRevision: state.streamRevision + 1,
    })),
  endTool: ({ name, ok, summary }) =>
    set((state) => ({
      toolActivities: state.toolActivities.map((item) =>
        item.name === name && item.status === 'running'
          ? { ...item, status: ok ? 'done' : 'failed', summary, endedAt: Date.now() }
          : item,
      ),
      streamRevision: state.streamRevision + 1,
    })),
  finishStream: ({ suggestedActions }) =>
    set({
      isStreaming: false,
      suggestedActions: suggestedActions ?? null,
      error: null,
      isCancelled: false,
      reconnectRequired: false,
    }),
  failStream: (message) =>
    set({
      isStreaming: false,
      error: message,
      assistantContent: '',
      isCancelled: false,
    }),
  stopStream: () =>
    set({
      isStreaming: false,
      error: null,
      isCancelled: true,
      reconnectRequired: false,
    }),
  reset: () => set(initialState),
}));
