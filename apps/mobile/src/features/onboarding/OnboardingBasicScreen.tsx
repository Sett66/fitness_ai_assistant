import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button, ErrorText, Input, Label, Screen, Subtitle, Title } from '@fitness/ui';
import type { Gender } from '@fitness/shared';

import { useUpdateProfile } from '../../api/endpoints/users';
import { BirthDateField, birthDateToIso } from '../profile/components/BirthDateField';
import { GenderSelect } from '../profile/components/GenderSelect';
import { StepProgress } from '../profile/components/StepProgress';
import type { OnboardingStackParamList } from './OnboardingNavigator';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'OnboardingBasic'>;

export function OnboardingBasicScreen({ navigation }: Props) {
  const updateProfile = useUpdateProfile();

  const [gender, setGender] = useState<Gender>('MALE');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async () => {
    setLocalError(null);
    const birthDate = birthDateToIso(year, month, day);
    if (!birthDate) {
      setLocalError('请填写有效的出生日期');
      return;
    }
    const height = Number(heightCm);
    const weight = Number(weightKg);
    if (!height || height < 30 || height > 300) {
      setLocalError('请填写有效身高 (30–300 cm)');
      return;
    }
    if (!weight || weight < 10 || weight > 500) {
      setLocalError('请填写有效体重 (10–500 kg)');
      return;
    }

    await updateProfile.mutateAsync({
      gender,
      birthDate,
      heightCm: height,
      weightKg: weight,
      trainingYears: 0,
      goal: 'MAINTAIN',
    });
    navigation.navigate('OnboardingIdentity');
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="pb-8 gap-4">
        <Title>完善档案</Title>
        <Subtitle className="mb-2">先填写基础体征，用于计算训练与饮食建议</Subtitle>
        <StepProgress current={1} />

        <Label>性别</Label>
        <GenderSelect value={gender} onChange={setGender} />

        <BirthDateField
          year={year}
          month={month}
          day={day}
          onChangeYear={setYear}
          onChangeMonth={setMonth}
          onChangeDay={setDay}
        />

        <View>
          <Label>身高 (cm)</Label>
          <Input
            value={heightCm}
            onChangeText={setHeightCm}
            keyboardType="decimal-pad"
            placeholder="例如 175"
          />
        </View>

        <View>
          <Label>体重 (kg)</Label>
          <Input
            value={weightKg}
            onChangeText={setWeightKg}
            keyboardType="decimal-pad"
            placeholder="例如 70"
          />
        </View>

        {localError ? <ErrorText message={localError} /> : null}
        {updateProfile.error ? <ErrorText message={updateProfile.error.message} /> : null}

        <Button title="下一步" loading={updateProfile.isPending} onPress={submit} />
      </ScrollView>
    </Screen>
  );
}
