import { create } from 'zustand';

import { mmkv } from '../storage/mmkv';

const KEY_OPTIONAL = 'onboarding.optionalStepPending';

type OnboardingStore = {
  optionalStepPending: boolean;
  setOptionalStepPending: (value: boolean) => void;
  hydrate: () => void;
};

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  optionalStepPending: mmkv.getBoolean(KEY_OPTIONAL) ?? false,
  setOptionalStepPending: (value) => {
    mmkv.set(KEY_OPTIONAL, value);
    set({ optionalStepPending: value });
  },
  hydrate: () => {
    set({
      optionalStepPending: mmkv.getBoolean(KEY_OPTIONAL) ?? false,
    });
  },
}));
