import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Card, Subtitle, Title } from '@fitness/ui';

type ProfileSectionCardProps = {
  title: string;
  onEdit?: () => void;
  editLabel?: string;
  children: ReactNode;
};

export function ProfileSectionCard({
  title,
  onEdit,
  editLabel = '修改',
  children,
}: ProfileSectionCardProps) {
  return (
    <Card className="gap-1">
      <View className="mb-2 flex-row items-center justify-between">
        <Title className="text-lg">{title}</Title>
        {onEdit ? (
          <Pressable onPress={onEdit} hitSlop={8}>
            <Subtitle className="text-accent font-medium">{editLabel}</Subtitle>
          </Pressable>
        ) : null}
      </View>
      {children}
    </Card>
  );
}
