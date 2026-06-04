import { create } from 'zustand';

type CoachSessionState = {
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
};

export const useCoachSessionStore = create<CoachSessionState>((set) => ({
  activeConversationId: null,
  setActiveConversationId: (id) => set({ activeConversationId: id }),
}));
