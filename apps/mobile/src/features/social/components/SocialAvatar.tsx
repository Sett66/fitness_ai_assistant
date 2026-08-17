import { memo, useMemo } from 'react';
import { Image, View } from 'react-native';
import { Subtitle } from '@fitness/ui';

type SocialAvatarProps = {
  url: string | null;
  name: string;
  size?: number;
};

export const SocialAvatar = memo(function SocialAvatar({
  url,
  name,
  size = 40,
}: SocialAvatarProps) {
  const source = useMemo(() => (url ? { uri: url } : null), [url]);
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <View
      className="items-center justify-center overflow-hidden rounded-full border border-border bg-card"
      style={{ height: size, width: size }}
    >
      {source ? (
        <Image source={source} className="h-full w-full" />
      ) : (
        <Subtitle className={size <= 32 ? 'text-sm' : 'text-base'}>{initial}</Subtitle>
      )}
    </View>
  );
});
