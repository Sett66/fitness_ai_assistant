import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

type StatCardProps = {
  icon: ReactNode;
  value: string;
  label: string;
};

export function StatCard({ icon, value, label }: StatCardProps) {
  return (
    <View className="flex-1 rounded-2xl bg-card border border-border p-4">
      <View className="mb-3 h-10 w-10 items-center justify-center rounded-full bg-accent/20">
        {icon}
      </View>
      <Text className="text-lg font-bold text-foreground">{value}</Text>
      <Text className="mt-1 text-xs text-muted">{label}</Text>
    </View>
  );
}
