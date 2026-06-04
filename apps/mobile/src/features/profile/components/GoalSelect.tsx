import { Pressable, View } from 'react-native';

import { Subtitle, Title } from '@fitness/ui';
import type { Goal } from '@fitness/shared';
import { termsZhCN } from '@fitness/shared';

const OPTIONS: { value: Goal; label: string; hint: string }[] = [
  {
    value: 'MUSCLE_GAIN',
    label: termsZhCN.GOAL_MUSCLE_GAIN ?? '增肌',
    hint: '增肌训练 + 热量盈余',
  },
  { value: 'FAT_LOSS', label: termsZhCN.GOAL_FAT_LOSS ?? '减脂', hint: '控制热量 + 保留肌肉' },
  { value: 'MAINTAIN', label: termsZhCN.GOAL_MAINTAIN ?? '维持', hint: '维持当前体型' },
];

type GoalSelectProps = {
  value: Goal;
  onChange: (value: Goal) => void;
};

export function GoalSelect({ value, onChange }: GoalSelectProps) {
  return (
    <View className="gap-2">
      {OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            className={`rounded-xl border p-4 ${
              selected ? 'border-accent bg-accent/15' : 'border-border bg-card'
            }`}
            onPress={() => onChange(opt.value)}
          >
            <Title className="text-base">{opt.label}</Title>
            <Subtitle className="mt-1">{opt.hint}</Subtitle>
          </Pressable>
        );
      })}
    </View>
  );
}
