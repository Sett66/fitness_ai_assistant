import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, ErrorText, Input, Label, Screen, Subtitle, Title } from '@fitness/ui';
import type { Goal } from '@fitness/shared';

import { useMe, usePatchProfile, useUpdateMe } from '../../api/endpoints/users';
import { useOnboardingStore } from '../../store/onboarding-store';
import { AvatarPicker } from '../profile/components/AvatarPicker';
import { GoalSelect } from '../profile/components/GoalSelect';
import { StepProgress } from '../profile/components/StepProgress';
import type { OnboardingStackParamList } from './OnboardingNavigator';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingIdentity'>;

export function OnboardingIdentityScreen({ navigation }: Props) {
  const me = useMe();
  const updateMe = useUpdateMe();
  const patchProfile = usePatchProfile();
  const setOptionalStepPending = useOnboardingStore((s) => s.setOptionalStepPending);

  const [displayName, setDisplayName] = useState(me.data?.user.displayName ?? '');
  const [goal, setGoal] = useState<Goal>(me.data?.profile?.goal ?? 'MUSCLE_GAIN');
  const [avatarMediaId, setAvatarMediaId] = useState<string | null>(
    me.data?.user.avatarMediaId ?? null,
  );
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!me.data) return;
    if (me.data.user.displayName) setDisplayName(me.data.user.displayName);
    if (me.data.profile?.goal) setGoal(me.data.profile.goal);
    if (me.data.user.avatarMediaId) setAvatarMediaId(me.data.user.avatarMediaId);
  }, [me.data]);

  const submit = async () => {
    setLocalError(null);
    const name = displayName.trim();
    if (name.length < 2) {
      setLocalError('用户名至少 2 个字符');
      return;
    }

    await updateMe.mutateAsync({
      displayName: name,
      avatarMediaId,
    });
    await patchProfile.mutateAsync({ goal });
    setOptionalStepPending(true);
    navigation.navigate('OnboardingOptional');
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="pb-8 gap-4">
        <Title>账号与目标</Title>
        <Subtitle className="mb-2">设置用户名和训练目标，头像可选</Subtitle>
        <StepProgress current={2} />

        <AvatarPicker
          avatarUrl={me.data?.user.avatarUrl}
          avatarMediaId={avatarMediaId}
          onChange={(mediaId) => setAvatarMediaId(mediaId)}
        />

        <View>
          <Label>用户名</Label>
          <Input
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="2–20 个字符"
            maxLength={20}
          />
        </View>

        <Label>训练目标</Label>
        <GoalSelect value={goal} onChange={setGoal} />

        {localError ? <ErrorText message={localError} /> : null}
        {updateMe.error ? <ErrorText message={updateMe.error.message} /> : null}
        {patchProfile.error ? <ErrorText message={patchProfile.error.message} /> : null}

        <Button
          title="下一步"
          loading={updateMe.isPending || patchProfile.isPending}
          onPress={submit}
        />
      </ScrollView>
    </Screen>
  );
}
