import { Pressable, Text, View } from 'react-native';
import type { CommentSummary, PostSummary } from '@fitness/shared';
import { Heart } from '@fitness/ui';

import {
  useLikeComment,
  useLikePost,
  useUnlikeComment,
  useUnlikePost,
} from '../../../api/endpoints/social';

type HeartLikeButtonProps = {
  likedByMe: boolean;
  likeCount: number;
  pending?: boolean;
  onPress: () => void;
  size?: number;
  className?: string;
};

function HeartLikeButton({
  likedByMe,
  likeCount,
  pending,
  onPress,
  size = 20,
  className,
}: HeartLikeButtonProps) {
  const color = likedByMe ? '#EF4444' : '#A1A1A1';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={likedByMe ? '取消点赞' : '点赞'}
      disabled={pending}
      hitSlop={8}
      onPress={(e) => {
        e.stopPropagation?.();
        onPress();
      }}
      className={className ?? 'mt-3 flex-row items-center gap-1.5 self-start'}
      style={{ opacity: pending ? 0.5 : 1 }}
    >
      <View>
        <Heart size={size} color={color} fill={likedByMe ? color : 'transparent'} strokeWidth={2} />
      </View>
      <Text className="text-sm" style={{ color }}>
        {likeCount}
      </Text>
    </Pressable>
  );
}

type LikeButtonProps = {
  post: PostSummary;
};

export function LikeButton({ post }: LikeButtonProps) {
  const like = useLikePost();
  const unlike = useUnlikePost();
  const pending =
    (like.isPending && like.variables === post.id) ||
    (unlike.isPending && unlike.variables === post.id);

  const onPress = () => {
    if (pending) return;
    if (post.likedByMe) unlike.mutate(post.id);
    else like.mutate(post.id);
  };

  return (
    <HeartLikeButton
      likedByMe={post.likedByMe}
      likeCount={post.likeCount}
      pending={pending}
      onPress={onPress}
    />
  );
}

type CommentLikeButtonProps = {
  comment: CommentSummary;
};

export function CommentLikeButton({ comment }: CommentLikeButtonProps) {
  const like = useLikeComment();
  const unlike = useUnlikeComment();
  const pending =
    (like.isPending && like.variables?.id === comment.id) ||
    (unlike.isPending && unlike.variables?.id === comment.id);

  const onPress = () => {
    if (pending) return;
    const target = { id: comment.id, postId: comment.postId };
    if (comment.likedByMe) unlike.mutate(target);
    else like.mutate(target);
  };

  return (
    <HeartLikeButton
      likedByMe={comment.likedByMe}
      likeCount={comment.likeCount}
      pending={pending}
      onPress={onPress}
      size={16}
      className="flex-row items-center gap-1 self-start py-1"
    />
  );
}
