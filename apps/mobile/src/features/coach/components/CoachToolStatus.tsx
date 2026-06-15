import { useEffect, useState } from 'react';

import { Text, View } from 'react-native';

import type { CoachToolActivity } from '../coach-stream-store';
import { getVisibleToolActivities, type CoachToolActivityRow } from '../coach-tool-display';

type CoachToolStatusProps = {
  activities: CoachToolActivity[];
  isStreaming: boolean;
  hasAssistantContent: boolean;
};

function activityText(item: CoachToolActivityRow): string {
  if (item.status === 'running') {
    return item.label;
  }
  if (item.status === 'failed') {
    return item.summary ?? `${item.label.replace(/…$/, '')}失败`;
  }
  if (item.summary) {
    return `完成 · ${item.summary}`;
  }
  return '完成';
}

export function CoachToolStatus({
  activities,
  isStreaming,
  hasAssistantContent,
}: CoachToolStatusProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isStreaming && activities.length === 0) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), 300);
    return () => clearInterval(timer);
  }, [isStreaming, activities.length]);

  const visible = getVisibleToolActivities(activities, isStreaming, hasAssistantContent, now);

  if (visible.length === 0) {
    return null;
  }

  return (
    <View className="mb-2 gap-1">
      {visible.map((item) => (
        <View key={item.rowKey} className="self-start rounded-full bg-muted/40 px-3 py-1">
          <Text
            className={`text-xs ${
              item.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'
            }`}
          >
            {activityText(item)}
          </Text>
        </View>
      ))}
    </View>
  );
}
