import { Pressable, View } from 'react-native';
import type { SocialUserProfile } from '@fitness/shared';
import { Subtitle, Title } from '@fitness/ui';

import { SocialAvatar } from './SocialAvatar';

type UserRowProps = {
  user: SocialUserProfile;
  onPress: () => void;
};

export function UserRow({ user, onPress }: UserRowProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-border px-4 py-3"
    >
      <SocialAvatar url={user.avatarUrl} name={user.displayName} size={44} />
      <View className="flex-1">
        <Title className="text-base">{user.displayName}</Title>
        <Subtitle>{user.postCount} 条动态</Subtitle>
      </View>
    </Pressable>
  );
}
