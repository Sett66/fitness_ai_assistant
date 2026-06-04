import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';

import type { WorkoutSplitType } from '@fitness/shared';
import { ErrorText, Input, Label } from '@fitness/ui';

import { ProfileEditSheet } from '../../profile/components/ProfileEditSheet';
import {
  DAYS_PER_WEEK_OPTIONS,
  SPLIT_TYPE_OPTIONS,
  type GenerateWorkoutPlanInput,
} from '../plan-types';

type GeneratePlanSheetProps = {
  visible: boolean;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: GenerateWorkoutPlanInput) => void;
};

export function GeneratePlanSheet({
  visible,
  loading,
  error,
  onClose,
  onSubmit,
}: GeneratePlanSheetProps) {
  const [splitType, setSplitType] = useState<WorkoutSplitType>('PPL');
  const [daysPerWeek, setDaysPerWeek] = useState(4);
  const [includeCardio, setIncludeCardio] = useState(false);
  const [mesocycleWeeks, setMesocycleWeeks] = useState('4');
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    onSubmit({
      mesocycleWeeks: Number(mesocycleWeeks) || 4,
      notes: notes.trim() || undefined,
      preferences: {
        splitType,
        daysPerWeek,
        includeCardio,
      },
    });
  };

  return (
    <ProfileEditSheet
      visible={visible}
      title="生成训练计划"
      onClose={onClose}
      onSave={handleSubmit}
      saving={loading}
      saveLabel={loading ? '生成中…' : '开始生成'}
    >
      {error ? <ErrorText message={error} /> : null}

      <View className="gap-2">
        <Label>训练分化</Label>
        <View className="flex-row flex-wrap gap-2">
          {SPLIT_TYPE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => setSplitType(opt.value)}
              className={`rounded-xl border px-3 py-2 ${splitType === opt.value ? 'border-accent bg-accent/20' : 'border-border bg-card'}`}
            >
              <Text
                className={
                  splitType === opt.value ? 'text-accent font-semibold' : 'text-foreground'
                }
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="gap-2">
        <Label>每周训练日</Label>
        <View className="flex-row flex-wrap gap-2">
          {DAYS_PER_WEEK_OPTIONS.map((n) => (
            <Pressable
              key={n}
              onPress={() => setDaysPerWeek(n)}
              className={`rounded-xl border px-3 py-2 ${daysPerWeek === n ? 'border-accent bg-accent/20' : 'border-border bg-card'}`}
            >
              <Text className={daysPerWeek === n ? 'text-accent font-semibold' : 'text-foreground'}>
                {n} 天
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
        <Label className="mb-0">包含有氧训练</Label>
        <Switch value={includeCardio} onValueChange={setIncludeCardio} />
      </View>

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
          placeholder="伤病、可用器械、偏好动作等"
          multiline
          className="min-h-[80px]"
        />
      </View>
    </ProfileEditSheet>
  );
}
