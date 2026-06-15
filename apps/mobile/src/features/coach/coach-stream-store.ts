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
  userMessageId: string | null;
  userContent: string | null;
  userImageObjectKeys: string[] | null;
  userImagePreviewUris: string[] | null;
  assistantMessageId: string | null;
  assistantContent: string;
  suggestedActions: SuggestedAction[] | null;
  toolActivities: CoachToolActivity[];
  error: string | null;
  startStream: (params: {
    userMessageId: string;
    userContent: string;
    assistantMessageId: string;
    userImageObjectKeys?: string[];
    userImagePreviewUris?: string[];
  }) => void;
  setAssistantContent: (content: string) => void;
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
  userMessageId: null,
  userContent: null,
  userImageObjectKeys: null,
  userImagePreviewUris: null,
  assistantMessageId: null,
  assistantContent: '',
  suggestedActions: null,
  toolActivities: [] as CoachToolActivity[],
  error: null,
};

export const useCoachStreamStore = create<CoachStreamState>((set) => ({
  ...initialState,
  startStream: ({
    userMessageId,
    userContent,
    assistantMessageId,
    userImageObjectKeys,
    userImagePreviewUris,
  }) =>
    set({
      ...initialState,
      isStreaming: true,
      userMessageId,
      userContent,
      userImageObjectKeys: userImageObjectKeys?.length ? userImageObjectKeys : null,
      userImagePreviewUris: userImagePreviewUris?.length ? userImagePreviewUris : null,
      assistantMessageId,
      assistantContent: '',
      toolActivities: [],
    }),
  setAssistantContent: (content) =>
    set((state) => ({
      assistantContent: content,
      streamRevision: state.streamRevision + 1,
    })),
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
    }),
  failStream: (message) =>
    set({
      isStreaming: false,
      error: message,
    }),
  stopStream: () =>
    set({
      isStreaming: false,
      error: null,
    }),
  reset: () => set(initialState),
}));
