import { Pressable, Text, View } from 'react-native';
import type { CommentSummary, PostSummary } from '@fitness/shared';
import { Heart } from '@fitness/ui';

import {
  useCommentLikePending,
  usePostLikePending,
  useToggleCommentLike,
  useTogglePostLike,
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
      hitSlop={8}
      onPress={(e) => {
        e.stopPropagation?.();
        onPress();
      }}
      className={className ?? 'mt-3 flex-row items-center gap-1.5 self-start'}
      style={{ opacity: pending ? 0.6 : 1 }}
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
  const toggle = useTogglePostLike();
  const pending = usePostLikePending(post.id);

  return (
    <HeartLikeButton
      likedByMe={post.likedByMe}
      likeCount={post.likeCount}
      pending={pending}
      onPress={() => toggle(post.id, post.likedByMe)}
    />
  );
}

type CommentLikeButtonProps = {
  comment: CommentSummary;
};

export function CommentLikeButton({ comment }: CommentLikeButtonProps) {
  const toggle = useToggleCommentLike();
  const pending = useCommentLikePending(comment.postId, comment.id);

  return (
    <HeartLikeButton
      likedByMe={comment.likedByMe}
      likeCount={comment.likeCount}
      pending={pending}
      onPress={() => toggle({ id: comment.id, postId: comment.postId }, comment.likedByMe)}
      size={16}
      className="flex-row items-center gap-1 self-start py-1"
    />
  );
}
