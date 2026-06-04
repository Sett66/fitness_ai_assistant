import type { CoachChatOutput } from '@fitness/shared';
import { create } from 'zustand';

type SuggestedAction = NonNullable<CoachChatOutput['suggestedActions']>[number];

type CoachStreamState = {
  isStreaming: boolean;
  streamRevision: number;
  userMessageId: string | null;
  userContent: string | null;
  assistantMessageId: string | null;
  assistantContent: string;
  suggestedActions: SuggestedAction[] | null;
  error: string | null;
  startStream: (params: {
    userMessageId: string;
    userContent: string;
    assistantMessageId: string;
  }) => void;
  setAssistantContent: (content: string) => void;
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
  assistantMessageId: null,
  assistantContent: '',
  suggestedActions: null,
  error: null,
};

export const useCoachStreamStore = create<CoachStreamState>((set) => ({
  ...initialState,
  startStream: ({ userMessageId, userContent, assistantMessageId }) =>
    set({
      ...initialState,
      isStreaming: true,
      userMessageId,
      userContent,
      assistantMessageId,
      assistantContent: '',
    }),
  setAssistantContent: (content) =>
    set((state) => ({
      assistantContent: content,
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
