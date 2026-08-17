import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ErrorText, Plus, Screen, Search, Subtitle, Title } from '@fitness/ui';

import { useDeletePost, useSocialFeed } from '../../api/endpoints/social';
import type { MainTabParamList, RootStackParamList } from '../../app/navigation/RootNavigator';
import { PostCard } from './components/PostCard';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Social'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export function FeedScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const feed = useSocialFeed();
  const deletePost = useDeletePost();

  const items = feed.data?.pages.flatMap((page) => page.items) ?? [];
  const errorMessage = feed.error instanceof Error ? feed.error.message : null;

  return (
    <Screen className="px-0">
      <View className="px-4 pb-2">
        <Title>社区</Title>
        <Subtitle>分享训练感受、饮食和进度</Subtitle>
        <Pressable
          onPress={() => navigation.navigate('SocialSearch')}
          className="mt-3 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5"
        >
          <Search color="#A1A1A1" size={18} strokeWidth={2} />
          <Subtitle>搜索动态或用户</Subtitle>
        </Pressable>
      </View>

      {errorMessage ? (
        <View className="px-4 pb-2">
          <ErrorText message={errorMessage} />
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onPress={() => navigation.navigate('PostDetail', { postId: item.id })}
            onAuthorPress={(userId) => navigation.navigate('SocialUser', { userId })}
            onDelete={item.isMine ? () => deletePost.mutate(item.id) : undefined}
          />
        )}
        refreshing={feed.isRefetching && !feed.isFetchingNextPage}
        onRefresh={() => void feed.refetch()}
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage) {
            void feed.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        contentContainerClassName="pb-24"
        ListEmptyComponent={
          feed.isLoading ? (
            <View className="items-center py-16">
              <ActivityIndicator />
            </View>
          ) : (
            <View className="items-center gap-3 px-8 py-16">
              <Subtitle className="text-center">还没有动态。发第一条，让广场不再空着。</Subtitle>
              <Button title="发一条动态" onPress={() => navigation.navigate('PostComposer')} />
            </View>
          )
        }
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <View className="py-4">
              <ActivityIndicator />
            </View>
          ) : null
        }
      />

      <Pressable
        onPress={() => navigation.navigate('PostComposer')}
        className="absolute right-5 h-14 w-14 items-center justify-center rounded-full bg-accent"
        style={{ bottom: Math.max(insets.bottom, 12) + 8 }}
      >
        <Plus color="#0A0A0A" size={26} strokeWidth={2} />
      </Pressable>
    </Screen>
  );
}
