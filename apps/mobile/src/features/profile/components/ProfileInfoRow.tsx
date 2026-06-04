import { View } from 'react-native';

import { Subtitle, Title } from '@fitness/ui';

type ProfileInfoRowProps = {
  label: string;
  value: string;
};

export function ProfileInfoRow({ label, value }: ProfileInfoRowProps) {
  return (
    <View className="flex-row items-center justify-between py-2.5 border-b border-border/60 last:border-b-0">
      <Subtitle>{label}</Subtitle>
      <Title className="text-base font-medium">{value}</Title>
    </View>
  );
}
