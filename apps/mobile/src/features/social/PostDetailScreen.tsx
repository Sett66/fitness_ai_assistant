import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorText, Screen, Subtitle } from '@fitness/ui';

import {
  useCreateComment,
  useDeleteComment,
  useDeletePost,
  usePostComments,
  usePostDetail,
} from '../../api/endpoints/social';
import type { RootStackParamList } from '../../app/navigation/RootNavigator';
import { useKeyboardHeight } from '../../hooks/useKeyboardHeight';
import { CommentComposer } from './components/CommentComposer';
import { CommentItem, CommentsSectionHeader } from './components/CommentItem';
import { PostCard } from './components/PostCard';

type Props = NativeStackScreenProps<RootStackParamList, 'PostDetail'>;

type ReplyTarget = {
  parentId: string;
  replyToName: string;
};

export function PostDetailScreen({ navigation, route }: Props) {
  const { postId } = route.params;
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const detail = usePostDetail(postId);
  const comments = usePostComments(postId);
  const createComment = useCreateComment(postId);
  const deleteComment = useDeleteComment();
  const deletePost = useDeletePost();

  const [draft, setDraft] = useState('');
  const [reply, setReply] = useState<ReplyTarget | null>(null);

  const items = useMemo(
    () => comments.data?.pages.flatMap((page) => page.items) ?? [],
    [comments.data],
  );

  const send = () => {
    const body = draft.trim();
    if (!body || createComment.isPending) return;
    createComment.mutate(
      { body, parentId: reply?.parentId },
      {
        onSuccess: () => {
          setDraft('');
          setReply(null);
        },
      },
    );
  };

  if (detail.isLoading) {
    return (
      <Screen className="px-0" safeTop={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <Screen className="px-0" safeTop={false}>
        <ErrorText message={detail.error instanceof Error ? detail.error.message : '动态不存在'} />
      </Screen>
    );
  }

  const post = detail.data;
  const commentsError = comments.error instanceof Error ? comments.error.message : null;
  const composerPad = keyboardHeight > 0 ? 8 : Math.max(insets.bottom, 8);

  return (
    <Screen className="px-0" safeTop={false}>
      <View className="flex-1">
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onEndReached={() => {
            if (comments.hasNextPage && !comments.isFetchingNextPage) {
              void comments.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <View>
              <PostCard
                post={post}
                divider={false}
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
              <CommentsSectionHeader count={post.commentCount} error={commentsError} />
            </View>
          }
          renderItem={({ item }) => (
            <CommentItem
              comment={item}
              onReply={(target) =>
                setReply({ parentId: target.id, replyToName: target.author.displayName })
              }
              onDelete={item.isMine ? (target) => deleteComment.mutate(target) : undefined}
            />
          )}
          ListEmptyComponent={
            comments.isLoading ? (
              <View className="items-center bg-surface py-10">
                <ActivityIndicator />
              </View>
            ) : (
              <View className="items-center bg-surface px-8 py-10">
                <Subtitle className="text-center">还没有评论，来抢沙发。</Subtitle>
              </View>
            )
          }
          ListFooterComponent={
            comments.isFetchingNextPage ? (
              <View className="bg-surface py-4">
                <ActivityIndicator />
              </View>
            ) : (
              <View className="h-3 bg-surface" />
            )
          }
        />
        <View style={{ marginBottom: keyboardHeight }}>
          <CommentComposer
            value={draft}
            onChangeText={setDraft}
            onSend={send}
            sending={createComment.isPending}
            replyToName={reply?.replyToName}
            onCancelReply={() => setReply(null)}
            bottomInset={composerPad}
          />
        </View>
      </View>
    </Screen>
  );
}
