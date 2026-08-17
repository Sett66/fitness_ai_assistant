import { Pressable, Text, View } from 'react-native';
import type { PostSummary } from '@fitness/shared';
import { Heart } from '@fitness/ui';

import { useLikePost, useUnlikePost } from '../../../api/endpoints/social';

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

  const color = post.likedByMe ? '#EF4444' : '#A1A1A1';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={post.likedByMe ? '取消点赞' : '点赞'}
      disabled={pending}
      hitSlop={8}
      onPress={(e) => {
        e.stopPropagation?.();
        onPress();
      }}
      className="mt-3 flex-row items-center gap-1.5 self-start"
      style={{ opacity: pending ? 0.5 : 1 }}
    >
      <View>
        <Heart
          size={20}
          color={color}
          fill={post.likedByMe ? color : 'transparent'}
          strokeWidth={2}
        />
      </View>
      <Text className="text-sm" style={{ color }}>
        {post.likeCount}
      </Text>
    </Pressable>
  );
}
