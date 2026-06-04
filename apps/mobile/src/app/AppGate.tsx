import { LoadingScreen } from '@fitness/ui';

import { useMe } from '../api/endpoints/users';
import { usePendingWorkoutSyncRunner } from '../hooks/usePendingWorkoutSync';
import { useOnboardingStore } from '../store/onboarding-store';
import { OnboardingNavigator } from '../features/onboarding/OnboardingNavigator';
import { AppNavigationContainer, RootNavigator } from './navigation/RootNavigator';

type AppGateProps = {
  isAuthenticated: boolean;
};

function PendingWorkoutSyncRunner() {
  usePendingWorkoutSyncRunner();
  return null;
}

export function AppGate({ isAuthenticated }: AppGateProps) {
  const me = useMe(isAuthenticated);
  const optionalStepPending = useOnboardingStore((s) => s.optionalStepPending);
  const planBootstrapPending = useOnboardingStore((s) => s.planBootstrapPending);

  let content: React.ReactNode;

  if (!isAuthenticated) {
    content = <RootNavigator mode="auth" />;
  } else if (me.isLoading) {
    content = <LoadingScreen />;
  } else if (me.isError || !me.data) {
    content = <RootNavigator mode="auth" />;
  } else {
    const needsOnboarding =
      !me.data.onboarding.complete || optionalStepPending || planBootstrapPending;
    content = needsOnboarding ? (
      <OnboardingNavigator
        initialStep={me.data.onboarding.step}
        showOptional={optionalStepPending && me.data.onboarding.complete && !planBootstrapPending}
        showPlanBootstrap={planBootstrapPending}
      />
    ) : (
      <>
        <PendingWorkoutSyncRunner />
        <RootNavigator mode="main" />
      </>
    );
  }

  return <AppNavigationContainer>{content}</AppNavigationContainer>;
}
