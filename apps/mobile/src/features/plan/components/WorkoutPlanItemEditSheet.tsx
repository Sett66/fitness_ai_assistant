import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import type { WorkoutPlanItemResponse } from '@fitness/shared';
import { ErrorText, Input, Label } from '@fitness/ui';

import { useExercises } from '../../../api/endpoints/users';
import { ProfileEditSheet } from '../../profile/components/ProfileEditSheet';

type WorkoutPlanItemEditSheetProps = {
  visible: boolean;
  item: WorkoutPlanItemResponse | null;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (body: {
    exerciseId?: string;
    plannedSets: number;
    plannedReps: number;
    plannedWeightKg: number | null;
    plannedRestSec: number;
    notes?: string | null;
  }) => void;
};

export function WorkoutPlanItemEditSheet({
  visible,
  item,
  saving,
  error,
  onClose,
  onSave,
}: WorkoutPlanItemEditSheetProps) {
  const exercises = useExercises(100);

  const [exerciseId, setExerciseId] = useState('');
  const [plannedSets, setPlannedSets] = useState('4');
  const [plannedReps, setPlannedReps] = useState('8');
  const [plannedWeightKg, setPlannedWeightKg] = useState('');
  const [plannedRestSec, setPlannedRestSec] = useState('90');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!item) return;
    setExerciseId(item.exerciseId);
    setPlannedSets(String(item.plannedSets));
    setPlannedReps(String(item.plannedReps));
    setPlannedWeightKg(item.plannedWeightKg != null ? String(item.plannedWeightKg) : '');
    setPlannedRestSec(String(item.plannedRestSec));
    setNotes(item.notes ?? '');
  }, [item]);

  const handleSave = () => {
    const weightRaw = plannedWeightKg.trim();
    onSave({
      exerciseId: exerciseId || undefined,
      plannedSets: Number(plannedSets) || 1,
      plannedReps: Number(plannedReps) || 1,
      plannedWeightKg: weightRaw ? Number(weightRaw) : null,
      plannedRestSec: Number(plannedRestSec) || 90,
      notes: notes.trim() || null,
    });
  };

  return (
    <ProfileEditSheet
      visible={visible}
      title={item?.exerciseName ?? '编辑动作'}
      onClose={onClose}
      onSave={handleSave}
      saving={saving}
    >
      {error ? <ErrorText message={error} /> : null}

      <View className="gap-2">
        <Label>替换动作</Label>
        <ScrollView className="max-h-40 rounded-xl border border-border bg-card">
          {(exercises.data?.items ?? []).map((ex) => (
            <Pressable
              key={ex.id}
              onPress={() => setExerciseId(ex.id)}
              className={`border-b border-border px-3 py-2 ${exerciseId === ex.id ? 'bg-accent/20' : ''}`}
            >
              <Text
                className={exerciseId === ex.id ? 'font-semibold text-accent' : 'text-foreground'}
              >
                {ex.nameZh}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 gap-2">
          <Label>组数</Label>
          <Input value={plannedSets} onChangeText={setPlannedSets} keyboardType="number-pad" />
        </View>
        <View className="flex-1 gap-2">
          <Label>次数</Label>
          <Input value={plannedReps} onChangeText={setPlannedReps} keyboardType="number-pad" />
        </View>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 gap-2">
          <Label>重量 (kg)</Label>
          <Input
            value={plannedWeightKg}
            onChangeText={setPlannedWeightKg}
            keyboardType="decimal-pad"
            placeholder="可选"
          />
        </View>
        <View className="flex-1 gap-2">
          <Label>休息 (秒)</Label>
          <Input
            value={plannedRestSec}
            onChangeText={setPlannedRestSec}
            keyboardType="number-pad"
          />
        </View>
      </View>

      <View className="gap-2">
        <Label>备注</Label>
        <Input
          value={notes}
          onChangeText={setNotes}
          placeholder="可选"
          multiline
          className="min-h-[60px]"
        />
      </View>
    </ProfileEditSheet>
  );
}
