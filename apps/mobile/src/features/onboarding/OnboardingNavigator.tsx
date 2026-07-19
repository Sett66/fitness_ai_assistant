import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { OnboardingStep } from '@fitness/shared';

import { OnboardingBasicScreen } from './OnboardingBasicScreen';
import { OnboardingIdentityScreen } from './OnboardingIdentityScreen';
import { OnboardingOptionalScreen } from './OnboardingOptionalScreen';

export type OnboardingStackParamList = {
  OnboardingBasic: undefined;
  OnboardingIdentity: undefined;
  OnboardingOptional: undefined;
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
};

export function OnboardingNavigator({ initialStep, showOptional }: OnboardingNavigatorProps) {
  const initialRoute = showOptional ? 'OnboardingOptional' : stepToRoute(initialStep);

  return (
    <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OnboardingBasic" component={OnboardingBasicScreen} />
      <Stack.Screen name="OnboardingIdentity" component={OnboardingIdentityScreen} />
      <Stack.Screen name="OnboardingOptional" component={OnboardingOptionalScreen} />
    </Stack.Navigator>
  );
}
