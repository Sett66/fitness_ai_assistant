import {
  COACH_MESSAGE_DELIVERY_FAILED,
  isCoachImagePlaceholderContent,
  type CoachAction,
  type Message,
} from '@fitness/shared';
import { memo } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Card } from '@fitness/ui';

import { CoachMessageBody } from './CoachMessageBody';
import { ChatMessageImages } from './ChatMessageImages';

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
  /** 失败的用户消息是否仍可原地重试（仅最后一条） */
  retryable?: boolean;
  onRetry?: (message: Message) => void;
  onEdit?: (message: Message) => void;
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

function extractImageObjectKeys(meta: Record<string, unknown>): string[] {
  const keys: string[] = [];
  if (Array.isArray(meta.imageObjectKeys)) {
    for (const key of meta.imageObjectKeys) {
      if (typeof key === 'string' && key && !keys.includes(key)) {
        keys.push(key);
      }
    }
  }
  if (typeof meta.imageObjectKey === 'string' && meta.imageObjectKey) {
    if (!keys.includes(meta.imageObjectKey)) {
      keys.unshift(meta.imageObjectKey);
    }
  }
  return keys;
}

function ChatBubbleComponent({
  message,
  onOpenPlan,
  onOpenMealVision,
  onSuggestedAction,
  onLayout,
  onLayoutStable,
  retryable,
  onRetry,
  onEdit,
}: ChatBubbleProps) {
  const isUser = message.role === 'USER';
  const meta = (message.metadata ?? {}) as Record<string, unknown>;
  const isRunning = meta.taskStatus === 'RUNNING';
  const isFailed = !isUser && meta.taskStatus === 'FAILED';
  const imageObjectKeys = extractImageObjectKeys(meta);
  const imagePreviewUris = Array.isArray(meta.imagePreviewUris)
    ? (meta.imagePreviewUris as string[])
    : [];
  const hasImages = imageObjectKeys.length > 0 || imagePreviewUris.length > 0;
  const displayContent =
    isUser && hasImages && isCoachImagePlaceholderContent(message.content) ? '' : message.content;

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

  const isDeliveryFailed = isUser && meta.deliveryStatus === COACH_MESSAGE_DELIVERY_FAILED;
  const failureReason = typeof meta.failureReason === 'string' ? meta.failureReason : undefined;
  const openFailedMenu = () => {
    Alert.alert('发送失败', failureReason, [
      ...(onEdit ? [{ text: '编辑', onPress: () => onEdit(message) }] : []),
      ...(retryable && onRetry ? [{ text: '重新发送', onPress: () => onRetry(message) }] : []),
      { text: '取消', style: 'cancel' as const },
    ]);
  };
  const Row = isDeliveryFailed ? Pressable : View;

  return (
    <View className="mb-3">
      <Row
        className={`flex-row ${isUser ? 'justify-end' : 'justify-start'}`}
        {...(isDeliveryFailed ? { onLongPress: openFailedMenu, delayLongPress: 300 } : {})}
      >
        <View
          className={`max-w-[85%] min-w-0 shrink rounded-2xl px-4 py-3 overflow-hidden ${
            isUser
              ? 'bg-accent'
              : isRunning
                ? 'bg-muted/30'
                : isFailed
                  ? 'bg-card border border-destructive'
                  : 'bg-card border border-border'
          }`}
        >
          {isUser && hasImages ? (
            <ChatMessageImages objectKeys={imageObjectKeys} previewUris={imagePreviewUris} />
          ) : null}
          <CoachMessageBody
            content={displayContent}
            isUser={isUser}
            onLayout={onLayout}
            onLayoutStable={onLayoutStable}
          />
          {!isUser && meta.incomplete === true ? (
            <Text className="mt-2 text-xs text-muted-foreground">已停止生成</Text>
          ) : null}
          {!isUser ? (
            <SuggestedActionChips
              actions={meta.incomplete === true ? [] : parseSuggestedActions(meta)}
              onPress={onSuggestedAction}
            />
          ) : null}
        </View>
      </Row>
      {isDeliveryFailed ? (
        <View className="mt-1 flex-row items-center justify-end gap-3">
          <Text className="text-xs text-destructive">发送失败</Text>
          {retryable && onRetry ? (
            <Pressable accessibilityLabel="重新发送" hitSlop={8} onPress={() => onRetry(message)}>
              <Text className="text-xs font-medium text-accent">↻ 重新发送</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
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
    prev.onLayoutStable === next.onLayoutStable &&
    prev.retryable === next.retryable &&
    prev.onRetry === next.onRetry &&
    prev.onEdit === next.onEdit
  );
});
