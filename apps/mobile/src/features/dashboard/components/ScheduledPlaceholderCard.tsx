import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@fitness/ui';

export function ScheduledPlaceholderCard() {
  const [enabled, setEnabled] = useState(false);

  return (
    <Card className="flex-row items-center justify-between">
      <View>
        <Text className="text-base font-semibold text-foreground">卧推</Text>
        <Text className="mt-1 text-sm text-muted">19:00</Text>
      </View>
      <Pressable
        onPress={() => setEnabled((v) => !v)}
        className={`rounded-full px-4 py-2 ${enabled ? 'bg-accent' : 'bg-card border border-border'}`}
      >
        <Text
          className={`text-sm font-semibold ${enabled ? 'text-accent-foreground' : 'text-accent'}`}
        >
          {enabled ? 'ON' : 'OFF'}
        </Text>
      </Pressable>
    </Card>
  );
}
