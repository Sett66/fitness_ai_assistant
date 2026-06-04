import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { OnboardingStep } from '@fitness/shared';

import { OnboardingBasicScreen } from './OnboardingBasicScreen';
import { OnboardingIdentityScreen } from './OnboardingIdentityScreen';
import { OnboardingOptionalScreen } from './OnboardingOptionalScreen';
import { OnboardingPlanBootstrapScreen } from './OnboardingPlanBootstrapScreen';

export type OnboardingStackParamList = {
  OnboardingBasic: undefined;
  OnboardingIdentity: undefined;
  OnboardingOptional: undefined;
  OnboardingPlanBootstrap: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

function stepToRoute(step: OnboardingStep): keyof OnboardingStackParamList {
  if (step === 'IDENTITY') return 'OnboardingIdentity';
  if (step === 'OPTIONAL') return 'OnboardingOptional';
  return 'OnboardingBasic';
}

type OnboardingNavigatorProps = {
  initialStep: OnboardingStep;
  showOptional?: boolean;
  showPlanBootstrap?: boolean;
};

export function OnboardingNavigator({
  initialStep,
  showOptional,
  showPlanBootstrap,
}: OnboardingNavigatorProps) {
  const initialRoute = showPlanBootstrap
    ? 'OnboardingPlanBootstrap'
    : showOptional
      ? 'OnboardingOptional'
      : stepToRoute(initialStep);

  return (
    <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OnboardingBasic" component={OnboardingBasicScreen} />
      <Stack.Screen name="OnboardingIdentity" component={OnboardingIdentityScreen} />
      <Stack.Screen name="OnboardingOptional" component={OnboardingOptionalScreen} />
      <Stack.Screen name="OnboardingPlanBootstrap" component={OnboardingPlanBootstrapScreen} />
    </Stack.Navigator>
  );
}
