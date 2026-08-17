import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { PostSummary, SocialSearchType, SocialUserProfile } from '@fitness/shared';
import { Button, ErrorText, Input, Screen, Subtitle } from '@fitness/ui';

import { ApiError } from '../../api/client';
import { useDeletePost, useSocialSearch } from '../../api/endpoints/social';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';
import { PostCard } from './components/PostCard';
import { UserRow } from './components/UserRow';

type Props = NativeStackScreenProps<RootStackParamList, 'SocialSearch'>;

const DEBOUNCE_MS = 400;

export function SocialSearchScreen({ navigation }: Props) {
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState<SocialSearchType>('POST');
  const search = useSocialSearch(type, q);
  const deletePost = useDeletePost();

  useEffect(() => {
    const timer = setTimeout(() => setQ(draft.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft]);

  const posts = search.data?.pages.flatMap((page) => page.posts?.items ?? []) ?? [];
  const users = search.data?.pages.flatMap((page) => page.users?.items ?? []) ?? [];
  const isUnavailable =
    search.error instanceof ApiError && search.error.code === 'SOCIAL_SEARCH_UNAVAILABLE';
  const errorMessage = search.error instanceof Error ? search.error.message : null;
  const items: Array<PostSummary | SocialUserProfile> = type === 'POST' ? posts : users;
  const emptyQuery = q.length === 0;

  return (
    <Screen className="px-0" safeTop={false}>
      <View className="px-4 pb-2">
        <Input
          autoFocus
          value={draft}
          onChangeText={setDraft}
          placeholder="搜索动态或用户"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View className="mt-3 flex-row gap-2">
          <TabButton label="动态" active={type === 'POST'} onPress={() => setType('POST')} />
          <TabButton label="用户" active={type === 'USER'} onPress={() => setType('USER')} />
        </View>
      </View>

      {isUnavailable ? (
        <View className="items-center gap-3 px-8 py-16">
          <ErrorText message={errorMessage ?? '搜索服务暂时不可用，请稍后再试'} />
          <Button title="重试" onPress={() => void search.refetch()} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) =>
            isPostResult(item) ? (
              <PostCard
                post={item}
                onPress={() => navigation.navigate('PostDetail', { postId: item.id })}
                onAuthorPress={(userId) => navigation.navigate('SocialUser', { userId })}
                onDelete={item.isMine ? () => deletePost.mutate(item.id) : undefined}
              />
            ) : (
              <UserRow
                user={item}
                onPress={() => navigation.navigate('SocialUser', { userId: item.id })}
              />
            )
          }
          onEndReached={() => {
            if (search.hasNextPage && !search.isFetchingNextPage) {
              void search.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            emptyQuery ? (
              <View className="items-center px-8 py-16">
                <Subtitle className="text-center">输入关键词，搜索动态或用户</Subtitle>
              </View>
            ) : search.isLoading ? (
              <View className="items-center py-16">
                <ActivityIndicator />
              </View>
            ) : errorMessage ? (
              <View className="items-center gap-3 px-8 py-16">
                <ErrorText message={errorMessage} />
                <Button title="重试" onPress={() => void search.refetch()} />
              </View>
            ) : (
              <View className="items-center px-8 py-16">
                <Subtitle className="text-center">没有找到相关结果</Subtitle>
              </View>
            )
          }
          ListFooterComponent={
            search.isFetchingNextPage ? (
              <View className="py-4">
                <ActivityIndicator />
              </View>
            ) : null
          }
        />
      )}
    </Screen>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full px-4 py-1.5 ${active ? 'bg-accent' : 'bg-card border border-border'}`}
    >
      <Subtitle className={active ? 'text-accent-foreground' : undefined}>{label}</Subtitle>
    </Pressable>
  );
}

function isPostResult(item: PostSummary | SocialUserProfile): item is PostSummary {
  return 'likedByMe' in item;
}
