import { useState } from 'react';
import { FlatList, View } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  Button,
  Card,
  ErrorText,
  LoadingScreen,
  MacroRow,
  Screen,
  Subtitle,
  Title,
} from '@fitness/ui';
import type { MealType } from '@fitness/shared';

import { useCreateMealLog, useMealLogs, useMealVision } from '../../api/endpoints/fitness';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';
import { ManualMealSheet, type ManualMealSubmitInput } from './components/ManualMealSheet';
import { mealTypeLabel } from './nutrition-labels';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function NutritionScreen() {
  const navigation = useNavigation<Nav>();
  const date = todayString();
  const logs = useMealLogs(date);
  const vision = useMealVision();
  const createLog = useCreateMealLog();
  const [mealType, setMealType] = useState<MealType>('LUNCH');
  const [manualVisible, setManualVisible] = useState(false);

  const pickAndAnalyze = async (fromCamera: boolean) => {
    const result = fromCamera
      ? await launchCamera({ mediaType: 'photo', quality: 0.8 })
      : await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });

    const asset = result.assets?.[0];
    if (!asset?.uri) return;

    vision.mutate(
      {
        fileUri: asset.uri,
        mime: asset.type ?? 'image/jpeg',
        sizeBytes: asset.fileSize ?? 500_000,
        mealType,
      },
      {
        onSuccess: (data) => navigation.navigate('MealVisionResult', { result: data, mealType }),
      },
    );
  };

  const handleManualSubmit = (input: ManualMealSubmitInput) => {
    createLog.mutate(
      {
        takenAt: new Date(),
        mealType: input.mealType,
        source: 'MANUAL',
        totalKcal: input.kcal,
        macros: input.macros,
        items: [
          {
            dishName: input.dishName,
            grams: input.grams,
            kcal: input.kcal,
            macros: input.macros,
            sourceTag: 'USER',
            foodId: input.foodId ?? null,
          },
        ],
      },
      { onSuccess: () => setManualVisible(false) },
    );
  };

  if (logs.isLoading) return <LoadingScreen />;

  return (
    <Screen>
      <View className="mb-4 gap-2">
        <Title>饮食记录</Title>
        <Subtitle>拍照识别、手动录入或查看今日日志</Subtitle>
        <View className="flex-row gap-2 flex-wrap">
          {(['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as MealType[]).map((m) => (
            <Button
              key={m}
              title={mealTypeLabel(m)}
              variant={mealType === m ? 'primary' : 'secondary'}
              className="flex-1 min-w-[70px] py-2"
              onPress={() => setMealType(m)}
            />
          ))}
        </View>
        {vision.error ? <ErrorText message={vision.error.message} /> : null}
        <Button title="手动添加" variant="secondary" onPress={() => setManualVisible(true)} />
        <Button
          title="拍照识别"
          loading={vision.isPending}
          onPress={() => void pickAndAnalyze(true)}
        />
        <Button
          title="从相册选择"
          variant="secondary"
          loading={vision.isPending}
          onPress={() => void pickAndAnalyze(false)}
        />
      </View>

      <FlatList
        data={logs.data?.items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerClassName="gap-3 pb-8"
        renderItem={({ item }) => (
          <Card>
            <Title className="text-base">{mealTypeLabel(item.mealType)}</Title>
            <MacroRow label="热量" value={item.totalKcal} unit=" kcal" />
            <Subtitle>{new Date(item.takenAt).toLocaleTimeString()}</Subtitle>
          </Card>
        )}
        ListEmptyComponent={<Subtitle>今日暂无饮食记录</Subtitle>}
      />

      <ManualMealSheet
        visible={manualVisible}
        defaultMealType={mealType}
        saving={createLog.isPending}
        error={createLog.error?.message ?? null}
        onClose={() => setManualVisible(false)}
        onSubmit={handleManualSubmit}
      />
    </Screen>
  );
}
