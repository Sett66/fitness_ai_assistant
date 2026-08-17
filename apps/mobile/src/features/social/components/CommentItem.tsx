import { Alert, Pressable, Text, View } from 'react-native';
import type { CommentSummary } from '@fitness/shared';
import { Subtitle } from '@fitness/ui';

import { formatRelativeTime } from '../relative-time';
import { CommentLikeButton } from './LikeButton';
import { SocialAvatar } from './SocialAvatar';

type CommentItemProps = {
  comment: CommentSummary;
  onReply: (comment: CommentSummary) => void;
  onDelete?: (comment: CommentSummary) => void;
};

export function CommentItem({ comment, onReply, onDelete }: CommentItemProps) {
  const confirmDelete = () => {
    if (!onDelete) return;
    Alert.alert('删除评论', '删除后无法恢复', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => onDelete(comment) },
    ]);
  };

  const isReply = Boolean(comment.parentId);

  return (
    <Pressable
      onLongPress={comment.isMine && onDelete ? confirmDelete : undefined}
      delayLongPress={350}
      className="bg-surface px-4 py-2.5"
    >
      <View className={`flex-row items-start gap-2.5 ${isReply ? 'pl-6' : ''}`}>
        <SocialAvatar url={comment.author.avatarUrl} name={comment.author.displayName} size={24} />
        <View className="flex-1">
          <View className="flex-row flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Text className="text-sm font-medium text-foreground">
              {comment.author.displayName}
            </Text>
            <Subtitle className="text-xs">{formatRelativeTime(comment.createdAt)}</Subtitle>
          </View>
          <Text className="mt-0.5 text-sm leading-5 text-foreground">
            {comment.replyToName ? (
              <Text className="text-muted">回复 @{comment.replyToName} </Text>
            ) : null}
            {comment.body}
          </Text>
          <View className="mt-0.5 flex-row items-center gap-4">
            <Pressable hitSlop={8} onPress={() => onReply(comment)} className="self-start py-1">
              <Subtitle className="text-xs text-accent">回复</Subtitle>
            </Pressable>
            <CommentLikeButton comment={comment} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

type CommentsSectionHeaderProps = {
  count: number;
  error?: string | null;
};

export function CommentsSectionHeader({ count, error }: CommentsSectionHeaderProps) {
  return (
    <View className="bg-surface">
      <View className="h-2 bg-background" />
      <View className="flex-row items-center justify-between border-b border-border px-4 py-2.5">
        <Text className="text-sm font-semibold text-foreground">评论</Text>
        <Subtitle className="text-xs">{count} 条</Subtitle>
      </View>
      {error ? (
        <View className="px-4 py-2">
          <Text className="text-sm text-destructive">{error}</Text>
        </View>
      ) : null}
    </View>
  );
}
