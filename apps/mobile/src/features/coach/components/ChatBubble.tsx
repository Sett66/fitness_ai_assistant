import type { CoachAction, Message } from '@fitness/shared';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@fitness/ui';

import { CoachMessageBody } from './CoachMessageBody';

type SuggestedAction = {
  action: Exclude<CoachAction, 'CHAT' | 'MANUAL_MEAL_LOG'>;
  label: string;
};

type ChatBubbleProps = {
  message: Message;
  onOpenPlan?: (planId: string) => void;
  onOpenMealVision?: (result: unknown, mealType: string) => void;
  onSuggestedAction?: (action: SuggestedAction['action']) => void;
  onLayout?: () => void;
  onLayoutStable?: () => void;
};

function parseSuggestedActions(meta: Record<string, unknown>): SuggestedAction[] {
  if (!Array.isArray(meta.suggestedActions)) {
    return [];
  }
  return meta.suggestedActions.filter(
    (item): item is SuggestedAction =>
      typeof item === 'object' &&
      item != null &&
      typeof (item as SuggestedAction).action === 'string' &&
      typeof (item as SuggestedAction).label === 'string',
  );
}

function SuggestedActionChips({
  actions,
  onPress,
}: {
  actions: SuggestedAction[];
  onPress?: (action: SuggestedAction['action']) => void;
}) {
  if (actions.length === 0 || !onPress) {
    return null;
  }
  return (
    <View className="flex-row flex-wrap gap-2 mt-3">
      {actions.map((item) => (
        <Pressable
          key={`${item.action}-${item.label}`}
          onPress={() => onPress(item.action)}
          className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5"
        >
          <Text className="text-sm text-accent">{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ChatBubbleComponent({
  message,
  onOpenPlan,
  onOpenMealVision,
  onSuggestedAction,
  onLayout,
  onLayoutStable,
}: ChatBubbleProps) {
  const isUser = message.role === 'USER';
  const meta = (message.metadata ?? {}) as Record<string, unknown>;
  const isRunning = meta.taskStatus === 'RUNNING';

  if (message.contentType === 'PLAN_CARD') {
    const planId = typeof meta.planId === 'string' ? meta.planId : null;
    return (
      <View className={`mb-3 ${isUser ? 'items-end' : 'items-start'}`}>
        <Card className="max-w-[90%] bg-card border-accent/30">
          <Text className="text-foreground font-medium">{message.content}</Text>
          {planId && onOpenPlan ? (
            <Text className="text-accent mt-2" onPress={() => onOpenPlan(planId)}>
              查看计划详情 →
            </Text>
          ) : null}
        </Card>
      </View>
    );
  }

  if (message.contentType === 'MEAL_VISION_CARD') {
    return (
      <View className={`mb-3 ${isUser ? 'items-end' : 'items-start'}`}>
        <Card className="max-w-[90%] bg-card border-accent/30">
          <Text className="text-foreground font-medium">{message.content}</Text>
          {onOpenMealVision && meta.result ? (
            <Text
              className="text-accent mt-2"
              onPress={() => onOpenMealVision(meta.result, String(meta.mealType ?? 'LUNCH'))}
            >
              确认识别结果 →
            </Text>
          ) : null}
        </Card>
      </View>
    );
  }

  return (
    <View className={`mb-3 flex-row ${isUser ? 'justify-end' : 'justify-start'}`}>
      <View
        className={`max-w-[85%] min-w-0 shrink rounded-2xl px-4 py-3 overflow-hidden ${
          isUser ? 'bg-accent' : isRunning ? 'bg-muted/30' : 'bg-card border border-border'
        }`}
      >
        <CoachMessageBody
          content={message.content}
          isUser={isUser}
          onLayout={onLayout}
          onLayoutStable={onLayoutStable}
        />
        {!isUser ? (
          <SuggestedActionChips actions={parseSuggestedActions(meta)} onPress={onSuggestedAction} />
        ) : null}
      </View>
    </View>
  );
}

export const ChatBubble = memo(ChatBubbleComponent, (prev, next) => {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.contentType === next.message.contentType &&
    prev.message.role === next.message.role &&
    JSON.stringify(prev.message.metadata) === JSON.stringify(next.message.metadata) &&
    prev.onLayout === next.onLayout &&
    prev.onLayoutStable === next.onLayoutStable
  );
});
