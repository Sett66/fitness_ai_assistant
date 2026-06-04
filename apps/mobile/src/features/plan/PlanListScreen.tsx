import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button, Card, LoadingScreen, Screen, Subtitle, Title } from '@fitness/ui';

import { usePlans } from '../../api/endpoints/fitness';
import type { MainTabParamList, RootStackParamList } from '../../app/navigation/RootNavigator';

type Nav = CompositeNavigationProp<
  NativeStackNavigationProp<RootStackParamList, 'PlanList'>,
  BottomTabNavigationProp<MainTabParamList>
>;
type PlanTab = 'WORKOUT' | 'MEAL';

export function PlanListScreen() {
  const navigation = useNavigation<Nav>();
  const [tab, setTab] = useState<PlanTab>('WORKOUT');

  const workoutPlans = usePlans('WORKOUT');
  const mealPlans = usePlans('MEAL');
  const activeQuery = tab === 'WORKOUT' ? workoutPlans : mealPlans;

  if (workoutPlans.isLoading || mealPlans.isLoading) return <LoadingScreen />;

  return (
    <Screen>
      <View className="mb-4 gap-2">
        <Title>我的计划</Title>
        <Subtitle>查看历史训练与饮食计划</Subtitle>

        <View className="flex-row gap-2">
          {(
            [
              { key: 'WORKOUT' as const, label: '训练计划' },
              { key: 'MEAL' as const, label: '饮食计划' },
            ] as const
          ).map(({ key, label }) => (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              className={`flex-1 rounded-xl border py-2 items-center ${tab === key ? 'border-accent bg-accent/20' : 'border-border bg-card'}`}
            >
              <Text className={tab === key ? 'text-accent font-semibold' : 'text-foreground'}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Button
          title="去 Coach 生成新计划"
          variant="secondary"
          onPress={() => navigation.navigate('Coach')}
        />
      </View>

      <FlatList
        data={activeQuery.data?.items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-3 pb-8"
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate('PlanDetail', { planId: item.id })}>
            <Card>
              <Text className="font-semibold text-foreground">
                {item.type === 'MEAL' ? '饮食' : '训练'} · {item.status}
              </Text>
              <Subtitle className="mt-1">
                {item.mesocycleWeeks} 周 · {new Date(item.startDate).toLocaleDateString()}
              </Subtitle>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={
          <Subtitle>暂无{tab === 'WORKOUT' ? '训练' : '饮食'}计划，请前往 Coach 生成</Subtitle>
        }
      />
    </Screen>
  );
}
