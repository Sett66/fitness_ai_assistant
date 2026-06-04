import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';

import { Button, ErrorText, Input, Label, Screen, Subtitle, Title } from '@fitness/ui';

import { usePatchProfile } from '../../api/endpoints/users';
import { queryKeys } from '../../api/queryKeys';
import { useOnboardingStore } from '../../store/onboarding-store';
import { StepProgress } from '../profile/components/StepProgress';
import { StrengthLevelEditor } from '../profile/components/StrengthLevelEditor';
import type { OnboardingStackParamList } from './OnboardingNavigator';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingOptional'>;

export function OnboardingOptionalScreen({ navigation }: Props) {
  const patchProfile = usePatchProfile();
  const qc = useQueryClient();
  const setOptionalStepPending = useOnboardingStore((s) => s.setOptionalStepPending);
  const setPlanBootstrapPending = useOnboardingStore((s) => s.setPlanBootstrapPending);

  const [trainingYears, setTrainingYears] = useState('');

  const finish = async (saveTrainingYears: boolean) => {
    if (saveTrainingYears && trainingYears.trim()) {
      await patchProfile.mutateAsync({ trainingYears: Number(trainingYears) });
    }
    setOptionalStepPending(false);
    setPlanBootstrapPending(true);
    await qc.invalidateQueries({ queryKey: queryKeys.me });
    navigation.navigate('OnboardingPlanBootstrap');
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="pb-8 gap-4">
        <Title>训练背景</Title>
        <Subtitle className="mb-2">以下信息可选，有助于 AI 生成更贴合的计划</Subtitle>
        <StepProgress current={3} />

        <View>
          <Label>训练年限（年，可选）</Label>
          <Input
            value={trainingYears}
            onChangeText={setTrainingYears}
            keyboardType="decimal-pad"
            placeholder="例如 1"
          />
        </View>

        <Title className="text-lg">运动表现（可选）</Title>
        <StrengthLevelEditor
          mode="batch"
          onBatchSaved={() => finish(Boolean(trainingYears.trim()))}
        />

        {patchProfile.error ? <ErrorText message={patchProfile.error.message} /> : null}

        <Button
          title="完成"
          loading={patchProfile.isPending}
          onPress={() => finish(Boolean(trainingYears.trim()))}
        />
        <Button title="跳过，稍后填写" variant="ghost" onPress={() => finish(false)} />
      </ScrollView>
    </Screen>
  );
}
