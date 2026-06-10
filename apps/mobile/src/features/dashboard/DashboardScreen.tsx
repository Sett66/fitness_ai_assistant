import { ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMemo } from 'react';

import { LoadingScreen, Screen, SectionHeader } from '@fitness/ui';

import { useMe, useExercises } from '../../api/endpoints/users';
import {
  useDailySummary,
  usePlan,
  usePlans,
  useWorkoutSessions,
} from '../../api/endpoints/fitness';
import type { MainTabParamList, RootStackParamList } from '../../app/navigation/RootNavigator';
import { CalorieCardsPlaceholder, CalorieCardsRow } from './components/CalorieCardsRow';
import { CoachPlaceholderCard } from './components/CoachPlaceholderCard';
import { DashboardHeader } from './components/DashboardHeader';
import { TodayExerciseCard } from './components/TodayExerciseCard';
import { TodayMealCard } from './components/TodayMealCard';
import { WeekActivityStrip } from './components/WeekActivityStrip';
import { resolveMealPlanDayForDate, resolvePlanDayForDate } from './utils/plan-day';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const date = todayString();

  const me = useMe();
  const summary = useDailySummary(date);
  const workoutPlans = usePlans('WORKOUT');
  const mealPlans = usePlans('MEAL');
  const sessions = useWorkoutSessions();
  const exercises = useExercises();

  const activeWorkoutPlan = workoutPlans.data?.items.find((p) => p.status === 'ACTIVE');
  const activeMealPlan = mealPlans.data?.items.find((p) => p.status === 'ACTIVE');
  const workoutPlanDetail = usePlan(activeWorkoutPlan?.id);
  const mealPlanDetail = usePlan(activeMealPlan?.id);

  const exerciseNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ex of exercises.data?.items ?? []) {
      map.set(ex.id, ex.nameZh);
    }
    return map;
  }, [exercises.data?.items]);

  const todayWorkoutDay = useMemo(() => {
    if (!activeWorkoutPlan || !workoutPlanDetail.data?.workoutDays) return null;
    return resolvePlanDayForDate(activeWorkoutPlan, workoutPlanDetail.data.workoutDays, new Date());
  }, [activeWorkoutPlan, workoutPlanDetail.data?.workoutDays]);

  const todayMealDay = useMemo(() => {
    if (!activeMealPlan || !mealPlanDetail.data?.mealDays) return null;
    return resolveMealPlanDayForDate(activeMealPlan, mealPlanDetail.data.mealDays, new Date());
  }, [activeMealPlan, mealPlanDetail.data?.mealDays]);

  if (
    me.isLoading ||
    summary.isLoading ||
    workoutPlans.isLoading ||
    mealPlans.isLoading ||
    sessions.isLoading ||
    (activeWorkoutPlan?.id && workoutPlanDetail.isLoading) ||
    (activeMealPlan?.id && mealPlanDetail.isLoading)
  ) {
    return <LoadingScreen />;
  }

  const workoutDays = workoutPlanDetail.data?.workoutDays ?? [];
  const sessionItems = sessions.data?.items ?? [];

  return (
    <Screen safeTop={false} className="px-0">
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32, paddingTop: insets.top + 8 }}
        contentContainerClassName="px-4 gap-0"
      >
        <DashboardHeader />

        <CoachPlaceholderCard onPress={() => navigation.navigate('Coach')} />

        {summary.data && me.data?.profile ? (
          <CalorieCardsRow
            summary={summary.data}
            sessions={sessionItems}
            planDays={workoutDays}
            weightKg={me.data.profile.weightKg}
            dateKey={date}
          />
        ) : (
          <CalorieCardsPlaceholder />
        )}

        <SectionHeader title="本周训练" />
        <WeekActivityStrip sessions={sessionItems} planDays={workoutDays} />

        <SectionHeader
          title="今日训练"
          actionLabel="我的计划"
          onAction={() => navigation.navigate('PlanList')}
        />
        <TodayExerciseCard
          day={todayWorkoutDay}
          hasActivePlan={Boolean(activeWorkoutPlan)}
          exerciseNameById={exerciseNameById}
          onPressPlan={
            activeWorkoutPlan
              ? () => navigation.navigate('PlanDetail', { planId: activeWorkoutPlan.id })
              : undefined
          }
        />

        <SectionHeader title="今日饮食" />
        <TodayMealCard
          day={todayMealDay}
          hasActivePlan={Boolean(activeMealPlan)}
          onPressPlan={
            activeMealPlan
              ? () => navigation.navigate('PlanDetail', { planId: activeMealPlan.id })
              : undefined
          }
        />
      </ScrollView>
    </Screen>
  );
}
