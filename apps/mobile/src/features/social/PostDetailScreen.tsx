import { ActivityIndicator, ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ErrorText, Screen, Subtitle } from '@fitness/ui';

import { useDeletePost, usePostDetail } from '../../api/endpoints/social';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';
import { PostCard } from './components/PostCard';

type Props = NativeStackScreenProps<RootStackParamList, 'PostDetail'>;

export function PostDetailScreen({ navigation, route }: Props) {
  const { postId } = route.params;
  const detail = usePostDetail(postId);
  const deletePost = useDeletePost();

  if (detail.isLoading) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <Screen>
        <ErrorText message={detail.error instanceof Error ? detail.error.message : '动态不存在'} />
      </Screen>
    );
  }

  const post = detail.data;

  return (
    <Screen className="px-0">
      <ScrollView>
        <PostCard
          post={post}
          onPress={() => undefined}
          onDelete={
            post.isMine
              ? () =>
                  deletePost.mutate(post.id, {
                    onSuccess: () => navigation.goBack(),
                  })
              : undefined
          }
        />
        <View className="px-4 py-6">
          <Subtitle>评论区即将开放</Subtitle>
        </View>
      </ScrollView>
    </Screen>
  );
}
