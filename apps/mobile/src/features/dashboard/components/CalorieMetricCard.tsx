import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Card, ProgressRing, useTheme } from '@fitness/ui';

type CalorieMetricCardProps = {
  title: string;
  subtitle: string;
  value: number;
  progress: number;
  icon: ReactNode;
  variant?: 'accent' | 'default';
  ringSize?: number;
  labelClassName?: string;
  sublabelClassName?: string;
};

export function CalorieMetricCard({
  title,
  subtitle,
  value,
  progress,
  icon,
  variant = 'accent',
  ringSize = 96,
  labelClassName,
  sublabelClassName,
}: CalorieMetricCardProps) {
  const { colors } = useTheme();
  const isAccent = variant === 'accent';

  return (
    <Card variant={variant} className="flex-row items-center justify-between p-4">
      <View className="flex-1 pr-3">
        <View className="mb-1 flex-row items-center gap-2">
          {icon}
          <Text
            className={`text-base font-semibold ${isAccent ? 'text-accent-foreground' : 'text-foreground'}`}
          >
            {title}
          </Text>
        </View>
        <Text className={`text-sm ${isAccent ? 'text-accent-foreground/70' : 'text-muted'}`}>
          {subtitle}
        </Text>
      </View>
      <ProgressRing
        progress={progress}
        size={ringSize}
        strokeWidth={8}
        trackColor={isAccent ? '#0A0A0A' : colors.border}
        progressColor={isAccent ? '#FFFFFF' : colors.accent}
        label={`${Math.round(value)}`}
        sublabel="kcal"
        labelClassName={
          labelClassName ??
          (isAccent
            ? 'text-xl font-bold text-accent-foreground'
            : 'text-xl font-bold text-foreground')
        }
        sublabelClassName={
          sublabelClassName ??
          (isAccent ? 'text-xs text-accent-foreground/70' : 'text-xs text-muted')
        }
      />
    </Card>
  );
}
