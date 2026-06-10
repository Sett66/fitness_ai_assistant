import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, SectionList, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { WorkoutPlanItemResponse } from '@fitness/shared';
import { Button, Card, LoadingScreen, MacroRow, Screen, Subtitle, Title } from '@fitness/ui';

import { useDeletePlan, usePlan, useUpdateWorkoutPlanItem } from '../../api/endpoints/fitness';
import { useExercises } from '../../api/endpoints/users';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';
import { mealTypeLabel } from '../nutrition/nutrition-labels';
import { WorkoutPlanItemEditSheet } from './components/WorkoutPlanItemEditSheet';

type Props = NativeStackScreenProps<RootStackParamList, 'PlanDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function PlanDetailScreen({ route }: Props) {
  const navigation = useNavigation<Nav>();
  const planId = route.params.planId;
  const plan = usePlan(planId);
  const deletePlan = useDeletePlan();
  const updateItem = useUpdateWorkoutPlanItem(planId);
  const exercises = useExercises();

  const [editingItem, setEditingItem] = useState<{
    dayId: string;
    item: WorkoutPlanItemResponse;
  } | null>(null);

  const exerciseNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ex of exercises.data?.items ?? []) {
      map.set(ex.id, ex.nameZh);
    }
    return map;
  }, [exercises.data?.items]);

  const mealSections = useMemo(() => {
    const mealDays = plan.data?.mealDays ?? [];
    const sorted = [...mealDays].sort((a, b) => a.weekIdx - b.weekIdx || a.dayIdx - b.dayIdx);
    const byWeek = new Map<number, typeof mealDays>();
    for (const day of sorted) {
      const list = byWeek.get(day.weekIdx) ?? [];
      list.push(day);
      byWeek.set(day.weekIdx, list);
    }
    return Array.from(byWeek.entries())
      .sort(([a], [b]) => a - b)
      .map(([weekIdx, data]) => ({
        title: `第 ${weekIdx + 1} 周`,
        data,
      }));
  }, [plan.data?.mealDays]);

  const resolveExerciseName = (item: WorkoutPlanItemResponse) =>
    item.exerciseName ?? exerciseNameById.get(item.exerciseId) ?? '未知动作';

  const handleDelete = () => {
    const label = plan.data?.type === 'MEAL' ? '饮食' : '训练';
    Alert.alert(`删除计划`, `确定删除这份${label}计划吗？此操作不可撤销。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          deletePlan.mutate(planId, {
            onSuccess: () => navigation.goBack(),
          });
        },
      },
    ]);
  };

  const handleSaveItem = (body: {
    exerciseId?: string;
    plannedSets: number;
    plannedReps: number;
    plannedWeightKg: number | null;
    plannedRestSec: number;
    notes?: string | null;
  }) => {
    if (!editingItem) return;
    updateItem.mutate(
      { dayId: editingItem.dayId, itemId: editingItem.item.id, body },
      { onSuccess: () => setEditingItem(null) },
    );
  };

  if (plan.isLoading) return <LoadingScreen />;
  if (!plan.data) {
    return (
      <Screen>
        <Title>计划不存在</Title>
      </Screen>
    );
  }

  const isMealPlan = plan.data.type === 'MEAL';
  const workoutDays = plan.data.workoutDays ?? [];
  const mealDays = plan.data.mealDays ?? [];
  const expectedMealDays = plan.data.mesocycleWeeks * 7;
  const mealPlanIncomplete = isMealPlan && mealDays.length < expectedMealDays;

  return (
    <Screen>
      <Title className="mb-2">
        {isMealPlan ? '饮食' : '训练'} · {plan.data.status} · {plan.data.mesocycleWeeks} 周
      </Title>
      <Subtitle className="mb-4">
        {new Date(plan.data.startDate).toLocaleDateString()} —{' '}
        {new Date(plan.data.endDate).toLocaleDateString()}
      </Subtitle>

      {isMealPlan ? (
        <SectionList
          sections={mealSections}
          keyExtractor={(d) => d.id}
          contentContainerClassName="pb-8"
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            <View className="mb-3 gap-2">
              <Subtitle>
                共 {mealDays.length} 天菜单
                {expectedMealDays > 0 ? ` · 完整周期 ${expectedMealDays} 天` : ''}
              </Subtitle>
              {mealPlanIncomplete ? (
                <Card className="border-accent/40 bg-accent/10">
                  <Subtitle>
                    当前计划天数不完整，首页「今日饮食」可能无法匹配到今日。可在 Coach
                    重新生成饮食计划以获取完整周菜单。
                  </Subtitle>
                </Card>
              ) : null}
            </View>
          }
          renderSectionHeader={({ section: { title } }) => (
            <Text className="mb-2 mt-2 text-base font-bold text-foreground">{title}</Text>
          )}
          ItemSeparatorComponent={() => <View className="h-3" />}
          SectionSeparatorComponent={() => <View className="h-2" />}
          ListFooterComponent={
            <Button
              title="删除计划"
              variant="destructive"
              loading={deletePlan.isPending}
              onPress={handleDelete}
              className="mt-4"
            />
          }
          renderItem={({ item }) => (
            <Card>
              <Text className="font-semibold text-foreground">
                W{item.weekIdx + 1} D{item.dayIdx + 1}
              </Text>
              <MacroRow label="日总热量" value={item.totalKcal} unit=" kcal" />
              {item.items?.map((meal) => (
                <View key={meal.id} className="mt-2 rounded-lg border border-border px-2 py-2">
                  <Text className="font-medium text-foreground">
                    {mealTypeLabel(meal.meal)} · {meal.dishName}
                  </Text>
                  <MacroRow label="热量" value={meal.kcal} unit=" kcal" />
                  {meal.cookingMethod ? (
                    <Subtitle className="mt-1">{meal.cookingMethod}</Subtitle>
                  ) : null}
                </View>
              ))}
            </Card>
          )}
          ListEmptyComponent={<Subtitle>暂无饮食日</Subtitle>}
        />
      ) : (
        <FlatList
          data={workoutDays}
          keyExtractor={(d) => d.id}
          contentContainerClassName="gap-3 pb-8"
          ListFooterComponent={
            <Button
              title="删除计划"
              variant="destructive"
              loading={deletePlan.isPending}
              onPress={handleDelete}
              className="mt-4"
            />
          }
          renderItem={({ item }) => (
            <Card>
              <Text className="font-semibold text-foreground">
                W{item.weekIdx + 1} D{item.dayIdx + 1} · {item.title}
              </Text>
              {item.restDay ? (
                <Subtitle>休息日</Subtitle>
              ) : (
                item.items?.map((it) => (
                  <Pressable
                    key={it.id}
                    onPress={() => setEditingItem({ dayId: item.id, item: it })}
                    className="mt-2 rounded-lg border border-border px-2 py-1"
                  >
                    <Text className="font-medium text-foreground">{resolveExerciseName(it)}</Text>
                    <Subtitle>
                      {it.plannedSets}×{it.plannedReps}
                      {it.plannedWeightKg ? ` @ ${it.plannedWeightKg}kg` : ''} · 休息{' '}
                      {it.plannedRestSec}s
                    </Subtitle>
                  </Pressable>
                ))
              )}
            </Card>
          )}
          ListEmptyComponent={<Subtitle>暂无训练日</Subtitle>}
        />
      )}

      <WorkoutPlanItemEditSheet
        visible={editingItem != null}
        item={editingItem?.item ?? null}
        saving={updateItem.isPending}
        error={updateItem.error?.message ?? null}
        onClose={() => setEditingItem(null)}
        onSave={handleSaveItem}
      />
    </Screen>
  );
}
