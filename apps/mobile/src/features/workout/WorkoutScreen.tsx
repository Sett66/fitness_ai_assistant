import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { WorkoutPlanDay } from '@fitness/shared';
import { Button, Card, ErrorText, Input, Label, Screen, Subtitle, Title } from '@fitness/ui';

import { useCreateWorkoutSession, usePlan, usePlans } from '../../api/endpoints/fitness';
import type { MainTabParamList, RootStackParamList } from '../../app/navigation/RootNavigator';
import { useExercises } from '../../api/endpoints/users';
import { usePendingWorkoutQueue } from '../../hooks/usePendingWorkoutQueue';
import {
  clearWorkoutDraft,
  loadWorkoutDraft,
  saveWorkoutDraft,
  type WorkoutDraft,
} from '../../storage/mmkv';
import { enqueuePendingWorkoutSession } from '../../storage/pending-workout-sessions';
import { formatPlanDayLabel, resolveWorkoutDaySelection } from '../dashboard/utils/plan-day';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Workout'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export function WorkoutScreen() {
  const navigation = useNavigation<Nav>();
  const plans = usePlans('WORKOUT');
  const activePlan = plans.data?.items.find((p) => p.status === 'ACTIVE');
  const planDetail = usePlan(activePlan?.id);
  const exercises = useExercises(100);
  const createSession = useCreateWorkoutSession();
  const { pendingCount, syncing, flushPendingSessions } = usePendingWorkoutQueue();

  const [draft, setDraft] = useState<WorkoutDraft>({
    sets: [],
    updatedAt: new Date().toISOString(),
  });
  const [restSec, setRestSec] = useState(90);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerLeft, setTimerLeft] = useState(0);
  const [reps, setReps] = useState('10');
  const [weight, setWeight] = useState('40');
  const [exerciseId, setExerciseId] = useState('');
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);

  const exerciseNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ex of exercises.data?.items ?? []) {
      map.set(ex.id, ex.nameZh);
    }
    return map;
  }, [exercises.data?.items]);

  const daySelection = useMemo(() => {
    if (!activePlan || !planDetail.data?.workoutDays) {
      return null;
    }
    return resolveWorkoutDaySelection(activePlan, planDetail.data.workoutDays, new Date());
  }, [activePlan, planDetail.data?.workoutDays]);

  const selectedDay = useMemo(() => {
    if (!daySelection) return null;
    if (selectedDayId) {
      return (
        daySelection.trainingDays.find((d) => d.id === selectedDayId) ?? daySelection.selectedDay
      );
    }
    return daySelection.selectedDay;
  }, [daySelection, selectedDayId]);

  const planItems = selectedDay?.items ?? [];

  const resolveExerciseName = (id: string) => exerciseNameById.get(id) ?? '未知动作';

  useEffect(() => {
    const saved = loadWorkoutDraft();
    if (saved) setDraft(saved);
  }, []);

  useEffect(() => {
    setSelectedDayId(null);
    setExerciseId('');
  }, [activePlan?.id]);

  useEffect(() => {
    const firstItem = planItems[0];
    if (firstItem && !exerciseId) {
      setExerciseId(firstItem.exerciseId);
      setRestSec(firstItem.plannedRestSec);
      setReps(String(firstItem.plannedReps));
      if (firstItem.plannedWeightKg != null) {
        setWeight(String(firstItem.plannedWeightKg));
      }
    }
  }, [planItems, exerciseId]);

  useEffect(() => {
    if (!timerRunning || timerLeft <= 0) return;
    const t = setInterval(() => setTimerLeft((v) => v - 1), 1000);
    return () => clearInterval(t);
  }, [timerRunning, timerLeft]);

  useEffect(() => {
    if (timerRunning && timerLeft <= 0) setTimerRunning(false);
  }, [timerLeft, timerRunning]);

  const selectPlanItem = (item: NonNullable<WorkoutPlanDay['items']>[number]) => {
    setExerciseId(item.exerciseId);
    setRestSec(item.plannedRestSec);
    setReps(String(item.plannedReps));
    if (item.plannedWeightKg != null) {
      setWeight(String(item.plannedWeightKg));
    }
  };

  const selectTrainingDay = (day: WorkoutPlanDay) => {
    setSelectedDayId(day.id);
    setExerciseId('');
    setDayPickerOpen(false);
    const firstItem = day.items?.[0];
    if (firstItem) {
      selectPlanItem(firstItem);
    }
  };

  const addSet = () => {
    if (!exerciseId) return;
    const next: WorkoutDraft = {
      ...draft,
      plannedDayId: selectedDay?.id ?? draft.plannedDayId,
      sets: [
        ...draft.sets,
        {
          exerciseId,
          setIdx: draft.sets.length,
          actualReps: Number(reps),
          actualWeightKg: Number(weight),
          isCompleted: true,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    setDraft(next);
    saveWorkoutDraft(next);
    setTimerLeft(restSec);
    setTimerRunning(true);
  };

  const resetDraft = () => {
    clearWorkoutDraft();
    setDraft({ sets: [], updatedAt: new Date().toISOString() });
  };

  const submit = () => {
    setSubmitNotice(null);
    const body = {
      plannedDayId: draft.plannedDayId ?? null,
      performedAt: new Date(),
      durationSec: null,
      sets: draft.sets,
    };

    createSession.mutate(body, {
      onSuccess: () => {
        resetDraft();
        setSubmitNotice('打卡已提交');
      },
      onError: () => {
        enqueuePendingWorkoutSession(body);
        resetDraft();
        setSubmitNotice('网络异常，打卡已保存到离线队列，联网后自动同步');
        flushPendingSessions();
      },
    });
  };

  const subtitle = !activePlan
    ? '请先生成训练计划'
    : daySelection?.calendarDay?.restDay
      ? `当前计划 ${activePlan.mesocycleWeeks} 周 · 今日休息`
      : `当前计划 ${activePlan.mesocycleWeeks} 周 · ${daySelection?.hint ?? '加载中…'}`;

  return (
    <Screen>
      <ScrollView contentContainerClassName="pb-8 gap-4">
        <Title>训练打卡</Title>
        <Subtitle>{subtitle}</Subtitle>
        <Button
          title="我的计划"
          variant="secondary"
          onPress={() => navigation.navigate('PlanList')}
        />

        {pendingCount > 0 ? (
          <Card className="gap-2 border-accent/40">
            <Subtitle>
              {syncing ? '正在同步离线打卡…' : `有 ${pendingCount} 条离线打卡待同步`}
            </Subtitle>
            <Button
              title="立即同步"
              variant="secondary"
              loading={syncing}
              onPress={() => void flushPendingSessions()}
            />
          </Card>
        ) : null}

        <Card className="gap-3">
          <Title className="text-lg">组间计时器</Title>
          <Text className="text-4xl font-bold text-accent text-center">
            {timerRunning ? `${timerLeft}s` : `${restSec}s`}
          </Text>
          <Button
            title={timerRunning ? '暂停' : '开始休息'}
            onPress={() => {
              if (timerRunning) setTimerRunning(false);
              else {
                setTimerLeft(restSec);
                setTimerRunning(true);
              }
            }}
          />
        </Card>

        <Card className="gap-3">
          <Title className="text-lg">记录一组</Title>

          {!activePlan ? (
            <Subtitle className="opacity-70">请先在「计划」页生成训练计划后再打卡</Subtitle>
          ) : (
            <>
              {daySelection?.hint ? (
                <Subtitle className="text-xs opacity-80">{daySelection.hint}</Subtitle>
              ) : null}

              {(daySelection?.trainingDays.length ?? 0) > 1 ? (
                <>
                  <Label>计划训练日</Label>
                  <Pressable
                    onPress={() => setDayPickerOpen(true)}
                    className="rounded-xl border border-border bg-card px-3 py-3"
                  >
                    <Subtitle>
                      {selectedDay ? formatPlanDayLabel(selectedDay) : '选择训练日'}
                    </Subtitle>
                  </Pressable>
                </>
              ) : null}

              <Label>动作</Label>
              {planItems.length > 0 ? (
                <View className="flex-row flex-wrap gap-2">
                  {planItems.map((item) => {
                    const name = resolveExerciseName(item.exerciseId);
                    const isSelected = exerciseId === item.exerciseId;
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => selectPlanItem(item)}
                        className={`rounded-xl border px-3 py-2 ${isSelected ? 'border-accent bg-accent/20' : 'border-border bg-card'}`}
                      >
                        <Text
                          className={isSelected ? 'font-semibold text-accent' : 'text-foreground'}
                        >
                          {name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <Subtitle className="opacity-70">当前计划中没有可打卡的动作</Subtitle>
              )}
            </>
          )}

          <Label>次数</Label>
          <Input value={reps} onChangeText={setReps} keyboardType="numeric" />
          <Label>重量 kg</Label>
          <Input value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
          <Button title="完成一组" onPress={addSet} disabled={!exerciseId} />
        </Card>

        <Card>
          <Title className="text-lg mb-2">已记录 {draft.sets.length} 组</Title>
          {draft.sets.map((s) => (
            <Subtitle key={`${s.exerciseId}-${s.setIdx}`}>
              #{s.setIdx + 1} · {resolveExerciseName(s.exerciseId)} · {s.actualReps} 次 @{' '}
              {s.actualWeightKg}kg
            </Subtitle>
          ))}
        </Card>

        {createSession.error ? <ErrorText message={createSession.error.message} /> : null}
        {submitNotice ? <Subtitle className="text-accent">{submitNotice}</Subtitle> : null}
        <Button
          title="提交打卡"
          loading={createSession.isPending}
          disabled={draft.sets.length === 0}
          onPress={submit}
        />
      </ScrollView>

      <Modal
        visible={dayPickerOpen}
        animationType="slide"
        onRequestClose={() => setDayPickerOpen(false)}
      >
        <View className="flex-1 bg-background px-4 pt-12">
          <Title className="mb-4">选择计划训练日</Title>
          <ScrollView className="flex-1">
            {(daySelection?.trainingDays ?? []).map((day) => (
              <Pressable
                key={day.id}
                className="border-b border-border py-3"
                onPress={() => selectTrainingDay(day)}
              >
                <Subtitle>{formatPlanDayLabel(day)}</Subtitle>
                <Subtitle className="mt-1 text-xs opacity-70">
                  {(day.items ?? []).map((i) => resolveExerciseName(i.exerciseId)).join('、')}
                </Subtitle>
              </Pressable>
            ))}
          </ScrollView>
          <Button title="关闭" variant="secondary" onPress={() => setDayPickerOpen(false)} />
        </View>
      </Modal>
    </Screen>
  );
}
