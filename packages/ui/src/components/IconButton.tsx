import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

type IconButtonProps = {
  icon: ReactNode;
  onPress?: () => void;
  size?: number;
};

export function IconButton({ icon, onPress, size = 44 }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      className="items-center justify-center rounded-full bg-accent"
      style={{ width: size, height: size }}
    >
      {icon}
    </Pressable>
  );
}
