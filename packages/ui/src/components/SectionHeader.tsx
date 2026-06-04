import { Pressable, Text, View } from 'react-native';

type SectionHeaderProps = {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function SectionHeader({ title, actionLabel = '查看全部', onAction }: SectionHeaderProps) {
  return (
    <View className="mb-3 flex-row items-center justify-between">
      <Text className="text-lg font-bold text-foreground">{title}</Text>
      {onAction ? (
        <Pressable onPress={onAction}>
          <Text className="text-sm font-medium text-accent">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
