import { Pressable, Text, View } from 'react-native';

import { Card, ChevronRight, MessageCircle } from '@fitness/ui';

type CoachPlaceholderCardProps = {
  onPress?: () => void;
};

export function CoachPlaceholderCard({ onPress }: CoachPlaceholderCardProps) {
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <Card className="mb-6 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3 flex-1">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-accent/20">
            <Text className="text-lg font-bold text-accent">A</Text>
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground">教练 Alex</Text>
            <Text className="text-sm text-accent">聊天 · 生成计划 · 识别餐食</Text>
          </View>
        </View>
        <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
          <MessageCircle size={18} color="#0A0A0A" strokeWidth={2} />
        </View>
        {onPress ? (
          <View className="ml-1">
            <ChevronRight size={18} color="#888888" />
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}
