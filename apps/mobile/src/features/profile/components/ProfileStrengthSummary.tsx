import { View } from 'react-native';

import { Subtitle } from '@fitness/ui';
import { formatStrengthLevelSummary } from '@fitness/shared';

import { useStrengthLevels } from '../../../api/endpoints/users';

export function ProfileStrengthSummary() {
  const strengths = useStrengthLevels();

  if (strengths.isLoading) {
    return <Subtitle className="py-2 opacity-70">加载中…</Subtitle>;
  }

  if (!strengths.data?.length) {
    return <Subtitle className="py-2 opacity-70">暂未记录运动表现</Subtitle>;
  }

  return (
    <View>
      {strengths.data.map((row) => (
        <View key={row.id} className="border-b border-border/60 py-2.5">
          <Subtitle className="font-medium text-foreground">
            {row.exerciseName ?? row.exerciseId}
          </Subtitle>
          <Subtitle className="mt-0.5 text-xs opacity-80">
            {formatStrengthLevelSummary(row)}
          </Subtitle>
        </View>
      ))}
    </View>
  );
}
