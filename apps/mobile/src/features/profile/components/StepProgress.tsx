import { View } from 'react-native';

import { Subtitle } from '@fitness/ui';

type StepProgressProps = {
  current: 1 | 2 | 3;
  labels?: [string, string, string];
};

const DEFAULT_LABELS: [string, string, string] = ['基础体征', '账号与目标', '训练背景'];

export function StepProgress({ current, labels = DEFAULT_LABELS }: StepProgressProps) {
  return (
    <View className="mb-6 gap-3">
      <View className="flex-row items-center justify-between">
        {[1, 2, 3].map((step) => (
          <View key={step} className="flex-1 flex-row items-center">
            <View
              className={`h-8 w-8 items-center justify-center rounded-full ${
                step <= current ? 'bg-accent' : 'bg-card border border-border'
              }`}
            >
              <Subtitle className={step <= current ? 'text-accent-foreground font-bold' : ''}>
                {step}
              </Subtitle>
            </View>
            {step < 3 ? (
              <View className={`mx-1 h-0.5 flex-1 ${step < current ? 'bg-accent' : 'bg-border'}`} />
            ) : null}
          </View>
        ))}
      </View>
      <Subtitle>
        第 {current}/3 步 · {labels[current - 1]}
      </Subtitle>
    </View>
  );
}
