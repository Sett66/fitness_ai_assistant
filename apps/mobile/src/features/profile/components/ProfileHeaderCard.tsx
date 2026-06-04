import { Image, Pressable, View } from 'react-native';

import { Card, Subtitle, Title } from '@fitness/ui';

type ProfileHeaderCardProps = {
  displayName?: string | null;
  avatarUrl?: string | null;
  onEdit?: () => void;
};

export function ProfileHeaderCard({ displayName, avatarUrl, onEdit }: ProfileHeaderCardProps) {
  const name = displayName?.trim() || '未设置用户名';

  return (
    <Card>
      <View className="flex-row items-center gap-4">
        <Pressable onPress={onEdit} disabled={!onEdit}>
          <View className="h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-border bg-card">
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} className="h-full w-full" />
            ) : (
              <Subtitle className="text-2xl opacity-50">{name.slice(0, 1).toUpperCase()}</Subtitle>
            )}
          </View>
        </Pressable>
        <View className="flex-1">
          <Title className="text-xl">{name}</Title>
          {onEdit ? (
            <Pressable onPress={onEdit} className="mt-2 self-start">
              <Subtitle className="text-accent">编辑资料</Subtitle>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
