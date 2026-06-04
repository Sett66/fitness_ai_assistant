import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import type { FoodResponse, MealType, Macros } from '@fitness/shared';
import { Button, ErrorText, Input, Label, Subtitle } from '@fitness/ui';

import { useFoods } from '../../../api/endpoints/foods';
import { ProfileEditSheet } from '../../profile/components/ProfileEditSheet';
import { mealTypeLabel } from '../nutrition-labels';
import { scaleFoodNutrition } from '../scale-food';

export type ManualMealSubmitInput = {
  mealType: MealType;
  dishName: string;
  grams: number;
  kcal: number;
  macros: Macros;
  foodId?: string;
};

type ManualMealSheetProps = {
  visible: boolean;
  defaultMealType: MealType;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: ManualMealSubmitInput) => void;
};

export function ManualMealSheet({
  visible,
  defaultMealType,
  saving,
  error,
  onClose,
  onSubmit,
}: ManualMealSheetProps) {
  const foods = useFoods();

  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [search, setSearch] = useState('');
  const [selectedFood, setSelectedFood] = useState<FoodResponse | null>(null);
  const [dishName, setDishName] = useState('');
  const [grams, setGrams] = useState('');
  const [kcal, setKcal] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setMealType(defaultMealType);
    setSearch('');
    setSelectedFood(null);
    setDishName('');
    setGrams('');
    setKcal('');
    setLocalError(null);
  }, [visible, defaultMealType]);

  const filteredFoods = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = foods.data?.items ?? [];
    if (!q) return items.slice(0, 8);
    return items
      .filter(
        (f) => f.nameZh.toLowerCase().includes(q) || (f.nameEn?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 8);
  }, [foods.data?.items, search]);

  const selectFood = (food: FoodResponse) => {
    setSelectedFood(food);
    setDishName(food.nameZh);
    setSearch(food.nameZh);
    const g = Number(grams);
    if (g > 0) {
      const scaled = scaleFoodNutrition(food.per100g, g);
      setKcal(String(scaled.kcal));
    }
  };

  const handleGramsChange = (value: string) => {
    setGrams(value);
    const g = Number(value);
    if (selectedFood && g > 0) {
      setKcal(String(scaleFoodNutrition(selectedFood.per100g, g).kcal));
    }
  };

  const handleSubmit = () => {
    setLocalError(null);
    const name = dishName.trim();
    if (!name) {
      setLocalError('请填写或选择食物');
      return;
    }
    const g = Number(grams);
    const k = Number(kcal);
    if (!g || g <= 0) {
      setLocalError('请填写有效克数');
      return;
    }
    if (Number.isNaN(k) || k < 0) {
      setLocalError('请填写有效热量');
      return;
    }

    const macros = selectedFood
      ? scaleFoodNutrition(selectedFood.per100g, g).macros
      : { protein: 0, carbs: 0, fat: 0 };

    onSubmit({
      mealType,
      dishName: name,
      grams: g,
      kcal: k,
      macros,
      foodId: selectedFood?.id,
    });
  };

  return (
    <ProfileEditSheet
      visible={visible}
      title="手动添加饮食"
      onClose={onClose}
      onSave={handleSubmit}
      saving={saving}
    >
      {error ? <ErrorText message={error} /> : null}
      {localError ? <ErrorText message={localError} /> : null}

      <View className="gap-2">
        <Label>餐次</Label>
        <View className="flex-row flex-wrap gap-2">
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
      </View>

      <View className="gap-2">
        <Label>搜索食物库</Label>
        <Input
          value={search}
          onChangeText={(text) => {
            setSearch(text);
            setSelectedFood(null);
            setDishName(text);
          }}
          placeholder="输入名称搜索，或下方手动填写"
        />
        {foods.isLoading ? <Subtitle>加载食物库…</Subtitle> : null}
        {filteredFoods.length > 0 && search.trim() ? (
          <FlatList
            data={filteredFoods}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => selectFood(item)}
                className={`rounded-lg border px-3 py-2 mb-2 ${selectedFood?.id === item.id ? 'border-accent bg-accent/10' : 'border-border'}`}
              >
                <Text className="font-medium text-foreground">{item.nameZh}</Text>
                <Subtitle>
                  {item.per100g.kcal} kcal / 100g · 蛋白 {item.per100g.protein}g
                </Subtitle>
              </Pressable>
            )}
          />
        ) : null}
      </View>

      <View className="gap-2">
        <Label>食物名称</Label>
        <Input value={dishName} onChangeText={setDishName} placeholder="例如 鸡胸肉" />
      </View>

      <View className="gap-2">
        <Label>克数 (g)</Label>
        <Input
          value={grams}
          onChangeText={handleGramsChange}
          keyboardType="decimal-pad"
          placeholder="例如 200"
        />
      </View>

      <View className="gap-2">
        <Label>热量 (kcal)</Label>
        <Input
          value={kcal}
          onChangeText={setKcal}
          keyboardType="decimal-pad"
          placeholder="例如 350"
        />
      </View>

      <Subtitle className="text-xs opacity-60">
        从食物库选择时会按 per100g 自动计算热量；也可自由填写名称与热量。
      </Subtitle>
    </ProfileEditSheet>
  );
}
