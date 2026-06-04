import { Image, Pressable, Text, View } from 'react-native';

import { Moon, Sun, useTheme } from '@fitness/ui';

import { useMe } from '../../../api/endpoints/users';
import { useUiStore } from '../../../store/ui-store';

export function DashboardHeader() {
  const me = useMe();
  const { mode, colors } = useTheme();
  const setColorScheme = useUiStore((s) => s.setColorScheme);

  const displayName = me.data?.user.displayName?.trim() || '未设置用户名';
  const avatarUrl = me.data?.user.avatarUrl;
  const initial = displayName.slice(0, 1).toUpperCase();

  const toggleTheme = () => {
    setColorScheme(mode === 'dark' ? 'light' : 'dark');
  };

  return (
    <View className="mb-4 flex-row items-center justify-between">
      <View className="flex-row items-center gap-3">
        <View className="h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-border bg-card">
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} className="h-full w-full" />
          ) : (
            <Text className="text-lg font-bold text-accent">{initial}</Text>
          )}
        </View>
        <View>
          <Text className="text-sm text-muted">欢迎回来</Text>
          <Text className="text-xl font-bold text-foreground">{displayName}</Text>
        </View>
      </View>
      <Pressable
        onPress={toggleTheme}
        accessibilityLabel="切换主题"
        className="h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
      >
        {mode === 'dark' ? (
          <Sun size={20} color={colors.accent} strokeWidth={1.5} />
        ) : (
          <Moon size={20} color={colors.accent} strokeWidth={1.5} />
        )}
      </Pressable>
    </View>
  );
}
