import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import type { FoodResponse, MealType } from '@fitness/shared';
import { scaleFoodNutrition } from '@fitness/shared';
import { Button, ErrorText, Input, Label, Subtitle } from '@fitness/ui';

import { useFoods } from '../../../api/endpoints/foods';
import { ProfileEditSheet } from '../../profile/components/ProfileEditSheet';
import { mealTypeLabel } from '../nutrition-labels';

export type ManualMealSubmitInput = {
  mealType: MealType;
  dishName: string;
  grams: number;
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
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setMealType(defaultMealType);
    setSearch('');
    setSelectedFood(null);
    setDishName('');
    setGrams('');
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

  const nutritionPreview = useMemo(() => {
    const g = Number(grams);
    if (!selectedFood || !g || g <= 0) return null;
    return scaleFoodNutrition(selectedFood.per100g, g);
  }, [grams, selectedFood]);

  const selectFood = (food: FoodResponse) => {
    setSelectedFood(food);
    setDishName(food.nameZh);
    setSearch(food.nameZh);
  };

  const handleSubmit = () => {
    setLocalError(null);
    const name = dishName.trim();
    if (!name) {
      setLocalError('请填写或选择食物');
      return;
    }
    const g = Number(grams);
    if (!g || g <= 0) {
      setLocalError('请填写有效克数');
      return;
    }
    if (!selectedFood) {
      setLocalError('请从食物库搜索并选择一项（系统将自动计算热量与营养）');
      return;
    }

    onSubmit({
      mealType,
      dishName: name,
      grams: g,
      foodId: selectedFood.id,
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
          placeholder="输入名称搜索并点选"
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
        <Label>克数 (g)</Label>
        <Input
          value={grams}
          onChangeText={setGrams}
          keyboardType="decimal-pad"
          placeholder="例如 200"
        />
      </View>

      {nutritionPreview ? (
        <View className="rounded-lg border border-border px-3 py-2 gap-1">
          <Text className="text-foreground font-medium">预计摄入</Text>
          <Subtitle>
            {nutritionPreview.kcal} kcal · 蛋白 {nutritionPreview.macros.protein}g · 碳水{' '}
            {nutritionPreview.macros.carbs}g · 脂肪 {nutritionPreview.macros.fat}g
          </Subtitle>
        </View>
      ) : null}

      <Subtitle className="text-xs opacity-60">
        从食物库选择食物并填写克数即可，热量与营养由系统自动计算。
      </Subtitle>
    </ProfileEditSheet>
  );
}
