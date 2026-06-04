import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { Button, ErrorText, Input, Label, Screen, Subtitle, Title } from '@fitness/ui';
import type { Gender, Goal } from '@fitness/shared';

import { useLogout } from '../../api/endpoints/auth';
import { useMe, usePatchProfile, useUpdateMe } from '../../api/endpoints/users';
import { AvatarPicker } from './components/AvatarPicker';
import { BirthDateField, birthDateToIso, isoToBirthParts } from './components/BirthDateField';
import { GenderSelect } from './components/GenderSelect';
import { GoalSelect } from './components/GoalSelect';
import { ProfileEditSheet } from './components/ProfileEditSheet';
import { ProfileHeaderCard } from './components/ProfileHeaderCard';
import { ProfileInfoRow } from './components/ProfileInfoRow';
import { ProfileSectionCard } from './components/ProfileSectionCard';
import { ProfileStrengthSummary } from './components/ProfileStrengthSummary';
import { StrengthLevelEditor } from './components/StrengthLevelEditor';
import { ageLabel, genderLabel, goalLabel, trainingYearsLabel } from './profile-labels';

type EditSheet = 'identity' | 'basic' | 'training' | 'strength' | null;

export function ProfileScreen() {
  const me = useMe();
  const logout = useLogout();
  const updateMe = useUpdateMe();
  const patchProfile = usePatchProfile();

  const [editSheet, setEditSheet] = useState<EditSheet>(null);

  const [displayName, setDisplayName] = useState('');
  const [avatarMediaId, setAvatarMediaId] = useState<string | null>(null);
  const [gender, setGender] = useState<Gender>('MALE');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [goal, setGoal] = useState<Goal>('MAINTAIN');
  const [trainingYears, setTrainingYears] = useState('');

  const [identityError, setIdentityError] = useState<string | null>(null);
  const [basicError, setBasicError] = useState<string | null>(null);
  const [trainingError, setTrainingError] = useState<string | null>(null);

  const profile = me.data?.profile;
  const user = me.data?.user;

  useEffect(() => {
    if (!profile && !user) return;
    if (user) {
      setDisplayName(user.displayName ?? '');
      setAvatarMediaId(user.avatarMediaId ?? null);
    }
    if (profile) {
      setGender(profile.gender);
      const parts = isoToBirthParts(profile.birthDate);
      setYear(parts.year);
      setMonth(parts.month);
      setDay(parts.day);
      setHeightCm(String(profile.heightCm));
      setWeightKg(String(profile.weightKg));
      setGoal(profile.goal);
      setTrainingYears(String(profile.trainingYears));
    }
  }, [profile, user]);

  const closeSheet = () => {
    setEditSheet(null);
    setIdentityError(null);
    setBasicError(null);
    setTrainingError(null);
    if (profile && user) {
      setDisplayName(user.displayName ?? '');
      setAvatarMediaId(user.avatarMediaId ?? null);
      setGender(profile.gender);
      const parts = isoToBirthParts(profile.birthDate);
      setYear(parts.year);
      setMonth(parts.month);
      setDay(parts.day);
      setHeightCm(String(profile.heightCm));
      setWeightKg(String(profile.weightKg));
      setGoal(profile.goal);
      setTrainingYears(String(profile.trainingYears));
    }
  };

  const saveIdentity = async () => {
    setIdentityError(null);
    const name = displayName.trim();
    if (name.length < 2) {
      setIdentityError('用户名至少 2 个字符');
      return;
    }
    await updateMe.mutateAsync({ displayName: name, avatarMediaId });
    setEditSheet(null);
  };

  const saveBasic = async () => {
    setBasicError(null);
    const birthDate = birthDateToIso(year, month, day);
    if (!birthDate) {
      setBasicError('请填写有效的出生日期');
      return;
    }
    await patchProfile.mutateAsync({
      gender,
      birthDate,
      heightCm: Number(heightCm),
      weightKg: Number(weightKg),
      goal,
    });
    setEditSheet(null);
  };

  const saveTraining = async () => {
    setTrainingError(null);
    const years = Number(trainingYears);
    if (trainingYears.trim() && (Number.isNaN(years) || years < 0 || years > 80)) {
      setTrainingError('请输入 0–80 之间的训练年限');
      return;
    }
    await patchProfile.mutateAsync({ trainingYears: years || 0 });
    setEditSheet(null);
  };

  if (me.isLoading) {
    return (
      <Screen>
        <Title>加载档案…</Title>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerClassName="pb-8 gap-4">
        <Title>我的档案</Title>

        <ProfileHeaderCard
          displayName={user?.displayName}
          avatarUrl={user?.avatarUrl}
          onEdit={() => setEditSheet('identity')}
        />

        {profile ? (
          <>
            <ProfileSectionCard title="基础体征" onEdit={() => setEditSheet('basic')}>
              <ProfileInfoRow label="性别" value={genderLabel(profile.gender)} />
              <ProfileInfoRow label="年龄" value={ageLabel(profile.birthDate)} />
              <ProfileInfoRow label="身高" value={`${profile.heightCm} cm`} />
              <ProfileInfoRow label="体重" value={`${profile.weightKg} kg`} />
              <ProfileInfoRow label="训练目标" value={goalLabel(profile.goal)} />
            </ProfileSectionCard>

            <ProfileSectionCard title="训练背景" onEdit={() => setEditSheet('training')}>
              <ProfileInfoRow label="训练年限" value={trainingYearsLabel(profile.trainingYears)} />
            </ProfileSectionCard>

            <ProfileSectionCard title="运动表现" onEdit={() => setEditSheet('strength')}>
              <ProfileStrengthSummary />
            </ProfileSectionCard>
          </>
        ) : (
          <Subtitle>尚未填写档案，请完成 onboarding 或联系支持。</Subtitle>
        )}

        <Button
          title="退出登录"
          variant="destructive"
          loading={logout.isPending}
          onPress={() => logout.mutate()}
        />
      </ScrollView>

      <ProfileEditSheet
        visible={editSheet === 'identity'}
        title="编辑账号"
        onClose={closeSheet}
        onSave={saveIdentity}
        saving={updateMe.isPending}
      >
        <AvatarPicker
          avatarUrl={user?.avatarUrl}
          avatarMediaId={avatarMediaId}
          onChange={(id) => setAvatarMediaId(id)}
        />
        <Label>用户名</Label>
        <Input value={displayName} onChangeText={setDisplayName} maxLength={20} />
        {identityError ? <ErrorText message={identityError} /> : null}
        {updateMe.error ? <ErrorText message={updateMe.error.message} /> : null}
      </ProfileEditSheet>

      <ProfileEditSheet
        visible={editSheet === 'basic'}
        title="编辑基础体征"
        onClose={closeSheet}
        onSave={saveBasic}
        saving={patchProfile.isPending}
      >
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
        <Subtitle className="text-xs opacity-60 -mt-2">
          档案页展示年龄；修改出生日期后年龄会自动更新
        </Subtitle>
        <Label>身高 (cm)</Label>
        <Input value={heightCm} onChangeText={setHeightCm} keyboardType="decimal-pad" />
        <Label>体重 (kg)</Label>
        <Input value={weightKg} onChangeText={setWeightKg} keyboardType="decimal-pad" />
        <Label>训练目标</Label>
        <GoalSelect value={goal} onChange={setGoal} />
        {basicError ? <ErrorText message={basicError} /> : null}
        {patchProfile.error ? <ErrorText message={patchProfile.error.message} /> : null}
      </ProfileEditSheet>

      <ProfileEditSheet
        visible={editSheet === 'training'}
        title="编辑训练背景"
        onClose={closeSheet}
        onSave={saveTraining}
        saving={patchProfile.isPending}
      >
        <Label>训练年限（年）</Label>
        <Input
          value={trainingYears}
          onChangeText={setTrainingYears}
          keyboardType="decimal-pad"
          placeholder="例如 1，留空视为 0"
        />
        {trainingError ? <ErrorText message={trainingError} /> : null}
        {patchProfile.error ? <ErrorText message={patchProfile.error.message} /> : null}
      </ProfileEditSheet>

      <ProfileEditSheet
        visible={editSheet === 'strength'}
        title="编辑运动表现"
        onClose={closeSheet}
        onSave={closeSheet}
        saveLabel="完成"
      >
        <StrengthLevelEditor mode="instant" />
      </ProfileEditSheet>
    </Screen>
  );
}
