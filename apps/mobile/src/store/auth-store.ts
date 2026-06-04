import { create } from 'zustand';

import type { StoredTokens } from '../storage/keychain';
import { clearTokens, loadTokens, saveTokens } from '../storage/keychain';

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  isHydrated: boolean;
  setTokens: (tokens: StoredTokens) => Promise<void>;
  clearAuth: () => Promise<void>;
  hydrate: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  isHydrated: false,
  setTokens: async (tokens) => {
    await saveTokens(tokens);
    set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  },
  clearAuth: async () => {
    await clearTokens();
    set({ accessToken: null, refreshToken: null });
  },
  hydrate: async () => {
    const tokens = await loadTokens();
    set({
      accessToken: tokens?.accessToken ?? null,
      refreshToken: tokens?.refreshToken ?? null,
      isHydrated: true,
    });
  },
}));

export function getAccessToken(): string | null {
  return useAuthStore.getState().accessToken;
}

export function getRefreshToken(): string | null {
  return useAuthStore.getState().refreshToken;
}
