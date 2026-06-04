import { create } from 'zustand';

import { mmkv } from '../storage/mmkv';

const KEY_OPTIONAL = 'onboarding.optionalStepPending';
const KEY_PLAN_BOOTSTRAP = 'onboarding.planBootstrapPending';

type OnboardingStore = {
  optionalStepPending: boolean;
  planBootstrapPending: boolean;
  setOptionalStepPending: (value: boolean) => void;
  setPlanBootstrapPending: (value: boolean) => void;
  hydrate: () => void;
};

export const useOnboardingStore = create<OnboardingStore>((set) => ({
  optionalStepPending: mmkv.getBoolean(KEY_OPTIONAL) ?? false,
  planBootstrapPending: mmkv.getBoolean(KEY_PLAN_BOOTSTRAP) ?? false,
  setOptionalStepPending: (value) => {
    mmkv.set(KEY_OPTIONAL, value);
    set({ optionalStepPending: value });
  },
  setPlanBootstrapPending: (value) => {
    mmkv.set(KEY_PLAN_BOOTSTRAP, value);
    set({ planBootstrapPending: value });
  },
  hydrate: () => {
    set({
      optionalStepPending: mmkv.getBoolean(KEY_OPTIONAL) ?? false,
      planBootstrapPending: mmkv.getBoolean(KEY_PLAN_BOOTSTRAP) ?? false,
    });
  },
}));
