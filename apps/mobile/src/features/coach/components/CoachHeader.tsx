import { Pressable, View } from 'react-native';

import { Menu, Subtitle, Title } from '@fitness/ui';

type CoachHeaderProps = {
  conversationTitle?: string | null;
  keyboardOpen?: boolean;
  onOpenDrawer: () => void;
};

export function CoachHeader({ conversationTitle, keyboardOpen, onOpenDrawer }: CoachHeaderProps) {
  const title = conversationTitle?.trim() || '新对话';

  return (
    <View
      className="flex-row items-center gap-3 px-4 pt-2 pb-2"
      style={{ zIndex: 20, elevation: 20 }}
    >
      <Pressable
        accessibilityLabel="会话列表"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onOpenDrawer}
        className="h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
      >
        <Menu size={20} color="#FAFAFA" strokeWidth={1.5} />
      </Pressable>

      <View className="flex-1">
        <Title>{title}</Title>
        {!keyboardOpen ? <Subtitle>教练 Alex · 闲聊也行 · 健身问题尤其专业</Subtitle> : null}
      </View>
    </View>
  );
}
