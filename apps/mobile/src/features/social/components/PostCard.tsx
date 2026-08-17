import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import type { PostSummary } from '@fitness/shared';
import { Subtitle, Title } from '@fitness/ui';

import { formatRelativeTime } from '../relative-time';
import { LikeButton } from './LikeButton';
import { PostImageGrid } from './PostImageGrid';
import { SocialAvatar } from './SocialAvatar';

type PostCardProps = {
  post: PostSummary;
  onPress: () => void;
  onDelete?: () => void;
  divider?: boolean;
};

const BODY_COLLAPSE_LEN = 140;

export function PostCard({ post, onPress, onDelete, divider = true }: PostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const collapsed = !expanded && post.body.length > BODY_COLLAPSE_LEN;
  const body = collapsed ? `${post.body.slice(0, BODY_COLLAPSE_LEN)}…` : post.body;

  const confirmDelete = () => {
    Alert.alert('删除动态', '删除后无法恢复', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <Pressable onPress={onPress} className={`px-4 py-3 ${divider ? 'border-b border-border' : ''}`}>
      <View className="flex-row items-start gap-3">
        <SocialAvatar url={post.author.avatarUrl} name={post.author.displayName} size={40} />
        <View className="flex-1">
          <View className="flex-row items-center justify-between gap-2">
            <View className="flex-1">
              <Title className="text-base">{post.author.displayName}</Title>
              <Subtitle>{formatRelativeTime(post.createdAt)}</Subtitle>
            </View>
            {post.isMine && onDelete ? (
              <Pressable
                hitSlop={8}
                onPress={(e) => {
                  e.stopPropagation?.();
                  confirmDelete();
                }}
                className="px-2 py-1"
              >
                <Text className="text-lg text-muted">···</Text>
              </Pressable>
            ) : null}
          </View>
          <Text className="mt-2 text-base text-foreground leading-6">{body}</Text>
          {collapsed ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                setExpanded(true);
              }}
              className="mt-1"
            >
              <Subtitle className="text-accent">展开</Subtitle>
            </Pressable>
          ) : null}
          {post.imageUrls.length > 0 ? (
            <View className="mt-3">
              <PostImageGrid urls={post.imageUrls} onPress={onPress} />
            </View>
          ) : null}
          <LikeButton post={post} />
        </View>
      </View>
    </Pressable>
  );
}
