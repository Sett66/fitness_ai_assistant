import { useState } from 'react';
import { View } from 'react-native';

import { ErrorText, Input, Label } from '@fitness/ui';

import { ProfileEditSheet } from '../../profile/components/ProfileEditSheet';
import type { GenerateMealPlanInput } from '../plan-types';

type GenerateMealPlanSheetProps = {
  visible: boolean;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: GenerateMealPlanInput) => void;
};

export function GenerateMealPlanSheet({
  visible,
  loading,
  error,
  onClose,
  onSubmit,
}: GenerateMealPlanSheetProps) {
  const [mesocycleWeeks, setMesocycleWeeks] = useState('4');
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    onSubmit({
      mesocycleWeeks: Number(mesocycleWeeks) || 4,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <ProfileEditSheet
      visible={visible}
      title="生成饮食计划"
      onClose={onClose}
      onSave={handleSubmit}
      saving={loading}
      saveLabel={loading ? '生成中…' : '开始生成'}
    >
      {error ? <ErrorText message={error} /> : null}

      <View className="gap-2">
        <Label>周期周数</Label>
        <Input
          value={mesocycleWeeks}
          onChangeText={setMesocycleWeeks}
          keyboardType="number-pad"
          placeholder="4"
        />
      </View>

      <View className="gap-2">
        <Label>补充说明（可选）</Label>
        <Input
          value={notes}
          onChangeText={setNotes}
          placeholder="过敏、忌口、偏好口味等"
          multiline
          className="min-h-[80px]"
        />
      </View>
    </ProfileEditSheet>
  );
}
