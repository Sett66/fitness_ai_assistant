import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MealVisionResultSchema, type Macros } from '@fitness/shared';

import {
  Button,
  Card,
  ErrorText,
  Input,
  Label,
  MacroRow,
  Screen,
  Subtitle,
  Title,
} from '@fitness/ui';

import { useCreateMealLog } from '../../api/endpoints/fitness';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'MealVisionResult'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

type EditableItem = {
  dishName: string;
  grams: string;
  kcal: string;
  macros: Macros;
};

export function MealVisionResultScreen({ route }: Props) {
  const navigation = useNavigation<Nav>();
  const createLog = useCreateMealLog();
  const { mealType, result } = route.params;

  const parsed = MealVisionResultSchema.safeParse(result);
  const [items, setItems] = useState<EditableItem[]>(() =>
    parsed.success
      ? parsed.data.items.map((item) => ({
          dishName: item.dishName,
          grams: String(item.grams),
          kcal: String(item.kcal),
          macros: item.macros,
        }))
      : [],
  );

  if (!parsed.success) {
    return (
      <Screen>
        <Title>无法解析识别结果</Title>
      </Screen>
    );
  }

  const { advice, nutritionContext } = parsed.data;

  const updateItem = (index: number, patch: Partial<EditableItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const handleConfirm = () => {
    const validItems = items.filter((item) => item.dishName.trim() && Number(item.grams) > 0);
    if (validItems.length === 0) return;

    const logItems = validItems.map((item) => ({
      dishName: item.dishName.trim(),
      grams: Number(item.grams),
      kcal: Number(item.kcal) || 0,
      macros: item.macros,
      sourceTag: 'AI_ESTIMATE' as const,
    }));

    const totalKcal = logItems.reduce((sum, item) => sum + item.kcal, 0);
    const macros = logItems.reduce(
      (acc, item) => ({
        protein: acc.protein + item.macros.protein,
        carbs: acc.carbs + item.macros.carbs,
        fat: acc.fat + item.macros.fat,
      }),
      { protein: 0, carbs: 0, fat: 0 },
    );

    createLog.mutate(
      {
        takenAt: new Date(),
        mealType,
        source: 'VISION',
        totalKcal,
        macros,
        items: logItems,
      },
      { onSuccess: () => navigation.goBack() },
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerClassName="pb-8 gap-4">
        <Title>识别结果</Title>
        <Subtitle>可修正份量与热量后再确认入库</Subtitle>

        {items.map((item, idx) => (
          <Card key={`${item.dishName}-${idx}`} className="gap-2">
            <Label>菜名</Label>
            <Input
              value={item.dishName}
              onChangeText={(text) => updateItem(idx, { dishName: text })}
            />
            <Label>克数 (g)</Label>
            <Input
              value={item.grams}
              onChangeText={(text) => updateItem(idx, { grams: text })}
              keyboardType="decimal-pad"
            />
            <Label>热量 (kcal)</Label>
            <Input
              value={item.kcal}
              onChangeText={(text) => updateItem(idx, { kcal: text })}
              keyboardType="decimal-pad"
            />
          </Card>
        ))}

        <Card>
          <MacroRow
            label="合计热量"
            value={items.reduce((sum, item) => sum + (Number(item.kcal) || 0), 0)}
            unit=" kcal"
          />
        </Card>

        {nutritionContext ? (
          <Card>
            <Title className="text-lg mb-2">今日营养（识别时）</Title>
            <MacroRow label="已摄入" value={nutritionContext.consumedKcal} unit=" kcal" />
            <MacroRow label="剩余" value={nutritionContext.remainingKcal} unit=" kcal" />
          </Card>
        ) : null}

        {advice ? (
          <Card>
            <Title className="text-lg mb-2">营养建议</Title>
            <Subtitle>{advice.summary}</Subtitle>
            <Subtitle className="mt-2">{advice.mealImpact}</Subtitle>
            {advice.dinnerSuggestion ? (
              <Subtitle className="mt-2">晚餐建议：{advice.dinnerSuggestion}</Subtitle>
            ) : null}
          </Card>
        ) : null}

        {createLog.error ? <ErrorText message={createLog.error.message} /> : null}

        <View className="gap-2">
          <Button title="确认并记录" loading={createLog.isPending} onPress={handleConfirm} />
          <Button title="取消" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </ScrollView>
    </Screen>
  );
}
