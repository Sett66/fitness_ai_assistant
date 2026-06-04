import { Pressable, Text, View } from 'react-native';

import { Bell } from '../icons';

type AppHeaderProps = {
  userName?: string;
  greeting?: string;
  onNotificationPress?: () => void;
};

export function AppHeader({
  userName = '健身者',
  greeting = '欢迎回来',
  onNotificationPress,
}: AppHeaderProps) {
  return (
    <View className="mb-4 flex-row items-center justify-between">
      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-card border border-border">
          <Text className="text-lg font-bold text-accent">
            {userName.slice(0, 1).toUpperCase()}
          </Text>
        </View>
        <View>
          <Text className="text-sm text-muted">{greeting}</Text>
          <Text className="text-xl font-bold text-foreground">{userName}</Text>
        </View>
      </View>
      <Pressable
        onPress={onNotificationPress}
        className="h-10 w-10 items-center justify-center rounded-full"
      >
        <Bell size={22} color="#FFFFFF" strokeWidth={1.5} />
      </Pressable>
    </View>
  );
}
