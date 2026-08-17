import { useEffect } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ErrorText, Screen, Subtitle, Title } from '@fitness/ui';

import { useDeletePost, useSocialUser, useSocialUserPosts } from '../../api/endpoints/social';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';
import { PostCard } from './components/PostCard';
import { SocialAvatar } from './components/SocialAvatar';

type Props = NativeStackScreenProps<RootStackParamList, 'SocialUser'>;

function formatJoinedAt(value: Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}年${date.getMonth() + 1}月加入`;
}

export function SocialUserScreen({ navigation, route }: Props) {
  const { userId } = route.params;
  const profile = useSocialUser(userId);
  const posts = useSocialUserPosts(userId);
  const deletePost = useDeletePost();

  useEffect(() => {
    if (profile.data?.displayName) {
      navigation.setOptions({ title: profile.data.displayName });
    }
  }, [navigation, profile.data?.displayName]);

  const items = posts.data?.pages.flatMap((page) => page.items) ?? [];
  const profileError = profile.error instanceof Error ? profile.error.message : null;
  const postsError = posts.error instanceof Error ? posts.error.message : null;

  if (profile.isLoading) {
    return (
      <Screen className="px-0" safeTop={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (profileError || !profile.data) {
    return (
      <Screen className="px-0" safeTop={false}>
        <View className="px-4 py-8">
          <ErrorText message={profileError ?? '用户不存在'} />
        </View>
      </Screen>
    );
  }

  const user = profile.data;

  return (
    <Screen className="px-0" safeTop={false}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onPress={() => navigation.navigate('PostDetail', { postId: item.id })}
            onAuthorPress={(id) => {
              if (id !== userId) navigation.push('SocialUser', { userId: id });
            }}
            onDelete={item.isMine ? () => deletePost.mutate(item.id) : undefined}
          />
        )}
        refreshing={posts.isRefetching && !posts.isFetchingNextPage}
        onRefresh={() => {
          void profile.refetch();
          void posts.refetch();
        }}
        onEndReached={() => {
          if (posts.hasNextPage && !posts.isFetchingNextPage) {
            void posts.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View className="flex-row items-center gap-4 border-b border-border px-4 py-4">
            <SocialAvatar url={user.avatarUrl} name={user.displayName} size={64} />
            <View className="flex-1">
              <Title>{user.displayName}</Title>
              <Subtitle className="mt-1">{user.postCount} 条动态</Subtitle>
              <Subtitle>{formatJoinedAt(user.joinedAt)}</Subtitle>
            </View>
          </View>
        }
        ListEmptyComponent={
          posts.isLoading ? (
            <View className="items-center py-16">
              <ActivityIndicator />
            </View>
          ) : postsError ? (
            <View className="px-4 py-8">
              <ErrorText message={postsError} />
            </View>
          ) : (
            <View className="items-center px-8 py-16">
              <Subtitle className="text-center">还没有动态</Subtitle>
            </View>
          )
        }
        ListFooterComponent={
          posts.isFetchingNextPage ? (
            <View className="py-4">
              <ActivityIndicator />
            </View>
          ) : null
        }
      />
    </Screen>
  );
}
