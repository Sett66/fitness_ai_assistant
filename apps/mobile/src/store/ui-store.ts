import { create } from 'zustand';

import { mmkv } from '../storage/mmkv';
type ThemeMode = 'dark' | 'light';

const UI_STORE_KEY = 'ui.colorScheme';

type UiState = {
  colorScheme: ThemeMode;
  setColorScheme: (mode: ThemeMode) => void;
  hydrate: () => void;
};

export const useUiStore = create<UiState>((set) => ({
  colorScheme: 'dark',
  setColorScheme: (mode) => {
    mmkv.set(UI_STORE_KEY, mode);
    set({ colorScheme: mode });
  },
  hydrate: () => {
    const stored = mmkv.getString(UI_STORE_KEY);
    if (stored === 'light' || stored === 'dark') {
      set({ colorScheme: stored });
    }
  },
}));
