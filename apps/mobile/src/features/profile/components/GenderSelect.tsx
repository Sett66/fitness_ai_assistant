import { Pressable, View } from 'react-native';

import { Subtitle } from '@fitness/ui';
import type { Gender } from '@fitness/shared';
import { termsZhCN } from '@fitness/shared';

const OPTIONS: { value: Gender; label: string }[] = [
  { value: 'MALE', label: termsZhCN.GENDER_MALE ?? '男' },
  { value: 'FEMALE', label: termsZhCN.GENDER_FEMALE ?? '女' },
  { value: 'OTHER', label: termsZhCN.GENDER_OTHER ?? '其他' },
];

type GenderSelectProps = {
  value: Gender;
  onChange: (value: Gender) => void;
};

export function GenderSelect({ value, onChange }: GenderSelectProps) {
  return (
    <View className="flex-row gap-2">
      {OPTIONS.map((opt) => {
        const selected = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            className={`flex-1 items-center rounded-xl border py-3 ${
              selected ? 'border-accent bg-accent/20' : 'border-border bg-card'
            }`}
            onPress={() => onChange(opt.value)}
          >
            <Subtitle className={selected ? 'font-semibold text-foreground' : ''}>
              {opt.label}
            </Subtitle>
          </Pressable>
        );
      })}
    </View>
  );
}
