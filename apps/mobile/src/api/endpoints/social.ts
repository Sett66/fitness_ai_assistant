import type {
  CommentLikeResponse,
  CommentListResponse,
  CommentSummary,
  CreateCommentRequest,
  CreatePostRequest,
  LikeResponse,
  PostListResponse,
  PostSummary,
  SocialSearchResponse,
  SocialSearchType,
  SocialUserProfile,
} from '@fitness/shared';
import {
  CommentLikeResponseSchema,
  CommentListResponseSchema,
  CreateCommentResponseSchema,
  CreatePostResponseSchema,
  LikeResponseSchema,
  MEDIA_MAX_SIZE_BYTES,
  PostListResponseSchema,
  PostSummarySchema,
  SocialSearchResponseSchema,
  SocialUserProfileSchema,
} from '@fitness/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';

import { apiFetch, uploadToPresignedUrl } from '../client';
import { presignRequestBody } from './media';
import { queryKeys } from '../queryKeys';

export function useSocialFeed() {
  return useInfiniteQuery({
    queryKey: queryKeys.socialFeed,
    queryFn: async ({ pageParam }): Promise<PostListResponse> => {
      const qs = pageParam ? `limit=20&cursor=${encodeURIComponent(pageParam)}` : 'limit=20';
      const json = await apiFetch<unknown>(`/social/posts?${qs}`, { noCache: true });
      return PostListResponseSchema.parse(json);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function usePostDetail(postId: string) {
  return useQuery({
    queryKey: queryKeys.socialPost(postId),
    queryFn: async (): Promise<PostSummary> => {
      const json = await apiFetch<unknown>(`/social/posts/${postId}`, { noCache: true });
      return PostSummarySchema.parse(json);
    },
    enabled: postId.length > 0,
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreatePostRequest): Promise<PostSummary> => {
      const json = await apiFetch<unknown>('/social/posts', { method: 'POST', body });
      return CreatePostResponseSchema.parse(json);
    },
    onSuccess: (post) => {
      qc.invalidateQueries({ queryKey: queryKeys.socialFeed });
      qc.invalidateQueries({ queryKey: ['social-search'] });
      qc.invalidateQueries({ queryKey: ['social-user'] });
      qc.invalidateQueries({ queryKey: ['social-user-posts'] });
      qc.setQueryData(queryKeys.socialPost(post.id), post);
    },
  });
}

export type PostImageFile = {
  uri: string;
  mime: string;
  sizeBytes: number;
};

export function useCreatePostFromComposer() {
  const createPost = useCreatePost();
  return useMutation({
    mutationFn: async (input: {
      body: string;
      images: PostImageFile[];
      visibility?: CreatePostRequest['visibility'];
      city?: CreatePostRequest['city'];
    }): Promise<PostSummary> => {
      const mediaIds: string[] = [];
      for (const file of input.images) {
        if (file.sizeBytes > MEDIA_MAX_SIZE_BYTES) {
          throw new Error('图片过大，单张不能超过 50MB');
        }
        const mime = file.mime || 'image/jpeg';
        const signed = await apiFetch<{ uploadUrl: string; objectKey: string }>('/uploads/sign', {
          method: 'POST',
          body: presignRequestBody('POST_IMAGE', {
            mime,
            sizeBytes: file.sizeBytes > 0 ? file.sizeBytes : 500_000,
          }),
        });
        await uploadToPresignedUrl(signed.uploadUrl, file.uri, mime);
        const completed = await apiFetch<{ mediaId: string }>('/uploads/complete', {
          method: 'POST',
          body: { objectKey: signed.objectKey },
        });
        mediaIds.push(completed.mediaId);
      }
      return createPost.mutateAsync({
        body: input.body,
        mediaIds,
        visibility: input.visibility ?? 'PUBLIC',
        ...(input.city ? { city: input.city } : {}),
      });
    },
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/social/posts/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.socialFeed });
      qc.invalidateQueries({ queryKey: ['social-search'] });
      qc.invalidateQueries({ queryKey: ['social-user'] });
      qc.invalidateQueries({ queryKey: ['social-user-posts'] });
      qc.removeQueries({ queryKey: queryKeys.socialPost(id) });
    },
  });
}

type SocialFeedInfinite = InfiniteData<PostListResponse, string | undefined>;
type SocialSearchInfinite = InfiniteData<SocialSearchResponse, string | undefined>;

type LikeCacheSnapshot = {
  feed: SocialFeedInfinite | undefined;
  detail: PostSummary | undefined;
  searches: [readonly unknown[], SocialSearchInfinite | undefined][];
  userPosts: [readonly unknown[], SocialFeedInfinite | undefined][];
};

function patchPostLike(post: PostSummary, likedByMe: boolean): PostSummary {
  if (post.likedByMe === likedByMe) return post;
  return {
    ...post,
    likedByMe,
    likeCount: likedByMe ? post.likeCount + 1 : Math.max(0, post.likeCount - 1),
  };
}

function patchFeedItems(
  data: SocialFeedInfinite | undefined,
  postId: string,
  patch: (post: PostSummary) => PostSummary,
): SocialFeedInfinite | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === postId ? patch(item) : item)),
    })),
  };
}

function patchSearchItems(
  data: SocialSearchInfinite | undefined,
  postId: string,
  patch: (post: PostSummary) => PostSummary,
): SocialSearchInfinite | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      posts: page.posts
        ? {
            ...page.posts,
            items: page.posts.items.map((item) => (item.id === postId ? patch(item) : item)),
          }
        : page.posts,
    })),
  };
}

function patchPostInAllLists(
  qc: QueryClient,
  postId: string,
  patch: (post: PostSummary) => PostSummary,
): void {
  const feed = qc.getQueryData<SocialFeedInfinite>(queryKeys.socialFeed);
  qc.setQueryData(queryKeys.socialFeed, patchFeedItems(feed, postId, patch));
  const detail = qc.getQueryData<PostSummary>(queryKeys.socialPost(postId));
  if (detail) {
    qc.setQueryData(queryKeys.socialPost(postId), patch(detail));
  }
  qc.setQueriesData<SocialSearchInfinite>({ queryKey: ['social-search', 'POST'] }, (data) =>
    patchSearchItems(data, postId, patch),
  );
  qc.setQueriesData<SocialFeedInfinite>({ queryKey: ['social-user-posts'] }, (data) =>
    patchFeedItems(data, postId, patch),
  );
}

function snapshotAndPatchLike(
  qc: QueryClient,
  postId: string,
  likedByMe: boolean,
): LikeCacheSnapshot {
  const feed = qc.getQueryData<SocialFeedInfinite>(queryKeys.socialFeed);
  const detail = qc.getQueryData<PostSummary>(queryKeys.socialPost(postId));
  const searches = qc.getQueriesData<SocialSearchInfinite>({ queryKey: ['social-search', 'POST'] });
  const userPosts = qc.getQueriesData<SocialFeedInfinite>({ queryKey: ['social-user-posts'] });
  patchPostInAllLists(qc, postId, (post) => patchPostLike(post, likedByMe));
  return { feed, detail, searches, userPosts };
}

function restoreLikeSnapshot(qc: QueryClient, postId: string, snap: LikeCacheSnapshot): void {
  qc.setQueryData(queryKeys.socialFeed, snap.feed);
  if (snap.detail === undefined) {
    qc.removeQueries({ queryKey: queryKeys.socialPost(postId) });
  } else {
    qc.setQueryData(queryKeys.socialPost(postId), snap.detail);
  }
  for (const [key, data] of snap.searches) {
    qc.setQueryData(key, data);
  }
  for (const [key, data] of snap.userPosts) {
    qc.setQueryData(key, data);
  }
}

function applyLikeResponse(qc: QueryClient, res: LikeResponse): void {
  patchPostInAllLists(qc, res.postId, (post) => ({
    ...post,
    likeCount: res.likeCount,
    likedByMe: res.likedByMe,
  }));
}

function useLikeMutation(likedByMe: boolean) {
  const qc = useQueryClient();
  const method = likedByMe ? 'PUT' : 'DELETE';
  return useMutation({
    mutationFn: async (postId: string): Promise<LikeResponse> => {
      const json = await apiFetch<unknown>(`/social/posts/${postId}/like`, { method });
      return LikeResponseSchema.parse(json);
    },
    onMutate: async (postId) => {
      await qc.cancelQueries({ queryKey: queryKeys.socialFeed });
      await qc.cancelQueries({ queryKey: queryKeys.socialPost(postId) });
      return snapshotAndPatchLike(qc, postId, likedByMe);
    },
    onError: (_err, postId, snap) => {
      if (snap) restoreLikeSnapshot(qc, postId, snap);
    },
    onSuccess: (res) => {
      applyLikeResponse(qc, res);
    },
  });
}

export function useLikePost() {
  return useLikeMutation(true);
}

export function useUnlikePost() {
  return useLikeMutation(false);
}

type SocialCommentsInfinite = InfiniteData<CommentListResponse, string | undefined>;

function patchPostCommentCount(post: PostSummary, delta: number): PostSummary {
  return { ...post, commentCount: Math.max(0, post.commentCount + delta) };
}

function bumpCommentCount(qc: QueryClient, postId: string, delta: number): void {
  patchPostInAllLists(qc, postId, (post) => patchPostCommentCount(post, delta));
}

function appendCommentToCache(qc: QueryClient, postId: string, comment: CommentSummary): void {
  const key = queryKeys.socialComments(postId);
  const current = qc.getQueryData<SocialCommentsInfinite>(key);
  if (!current || current.pages.length === 0) {
    qc.setQueryData<SocialCommentsInfinite>(key, {
      pageParams: [undefined],
      pages: [{ items: [comment], nextCursor: null }],
    });
    return;
  }
  const already = current.pages.some((page) => page.items.some((item) => item.id === comment.id));
  if (already) return;
  const last = current.pages.length - 1;
  qc.setQueryData<SocialCommentsInfinite>(key, {
    ...current,
    pages: current.pages.map((page, index) =>
      index === last ? { ...page, items: [...page.items, comment] } : page,
    ),
  });
}

function removeCommentFromCache(qc: QueryClient, postId: string, commentId: string): void {
  const key = queryKeys.socialComments(postId);
  const current = qc.getQueryData<SocialCommentsInfinite>(key);
  if (!current) return;
  qc.setQueryData<SocialCommentsInfinite>(key, {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== commentId),
    })),
  });
}

export function usePostComments(postId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.socialComments(postId),
    queryFn: async ({ pageParam }): Promise<CommentListResponse> => {
      const qs = pageParam ? `limit=20&cursor=${encodeURIComponent(pageParam)}` : 'limit=20';
      const json = await apiFetch<unknown>(`/social/posts/${postId}/comments?${qs}`, {
        noCache: true,
      });
      return CommentListResponseSchema.parse(json);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: postId.length > 0,
  });
}

export function useCreateComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateCommentRequest): Promise<CommentSummary> => {
      const json = await apiFetch<unknown>(`/social/posts/${postId}/comments`, {
        method: 'POST',
        body,
      });
      return CreateCommentResponseSchema.parse(json);
    },
    onSuccess: (comment) => {
      appendCommentToCache(qc, postId, comment);
      bumpCommentCount(qc, postId, 1);
      void qc.invalidateQueries({ queryKey: queryKeys.socialComments(postId) });
    },
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (comment: Pick<CommentSummary, 'id' | 'postId'>) => {
      await apiFetch(`/social/comments/${comment.id}`, { method: 'DELETE' });
      return comment;
    },
    onSuccess: (comment) => {
      removeCommentFromCache(qc, comment.postId, comment.id);
      bumpCommentCount(qc, comment.postId, -1);
      void qc.invalidateQueries({ queryKey: queryKeys.socialComments(comment.postId) });
    },
  });
}

type CommentLikeTarget = Pick<CommentSummary, 'id' | 'postId'>;

type CommentLikeCacheSnapshot = {
  comments: SocialCommentsInfinite | undefined;
};

function patchCommentLike(comment: CommentSummary, likedByMe: boolean): CommentSummary {
  if (comment.likedByMe === likedByMe) return comment;
  return {
    ...comment,
    likedByMe,
    likeCount: likedByMe ? comment.likeCount + 1 : Math.max(0, comment.likeCount - 1),
  };
}

function patchCommentsLike(
  data: SocialCommentsInfinite | undefined,
  commentId: string,
  likedByMe: boolean,
): SocialCommentsInfinite | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.id === commentId ? patchCommentLike(item, likedByMe) : item,
      ),
    })),
  };
}

function snapshotAndPatchCommentLike(
  qc: QueryClient,
  postId: string,
  commentId: string,
  likedByMe: boolean,
): CommentLikeCacheSnapshot {
  const key = queryKeys.socialComments(postId);
  const comments = qc.getQueryData<SocialCommentsInfinite>(key);
  qc.setQueryData(key, patchCommentsLike(comments, commentId, likedByMe));
  return { comments };
}

function restoreCommentLikeSnapshot(
  qc: QueryClient,
  postId: string,
  snap: CommentLikeCacheSnapshot,
): void {
  qc.setQueryData(queryKeys.socialComments(postId), snap.comments);
}

function applyCommentLikeResponse(qc: QueryClient, postId: string, res: CommentLikeResponse): void {
  const key = queryKeys.socialComments(postId);
  const current = qc.getQueryData<SocialCommentsInfinite>(key);
  if (!current) return;
  qc.setQueryData<SocialCommentsInfinite>(key, {
    ...current,
    pages: current.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.id === res.commentId
          ? { ...item, likeCount: res.likeCount, likedByMe: res.likedByMe }
          : item,
      ),
    })),
  });
}

function useCommentLikeMutation(likedByMe: boolean) {
  const qc = useQueryClient();
  const method = likedByMe ? 'PUT' : 'DELETE';
  return useMutation({
    mutationFn: async (target: CommentLikeTarget): Promise<CommentLikeResponse> => {
      const json = await apiFetch<unknown>(`/social/comments/${target.id}/like`, { method });
      return CommentLikeResponseSchema.parse(json);
    },
    onMutate: async (target) => {
      await qc.cancelQueries({ queryKey: queryKeys.socialComments(target.postId) });
      return snapshotAndPatchCommentLike(qc, target.postId, target.id, likedByMe);
    },
    onError: (_err, target, snap) => {
      if (snap) restoreCommentLikeSnapshot(qc, target.postId, snap);
    },
    onSuccess: (res, target) => {
      applyCommentLikeResponse(qc, target.postId, res);
    },
  });
}

export function useLikeComment() {
  return useCommentLikeMutation(true);
}

export function useUnlikeComment() {
  return useCommentLikeMutation(false);
}

export function useSocialSearch(type: SocialSearchType, q: string) {
  const trimmed = q.trim();
  return useInfiniteQuery({
    queryKey: queryKeys.socialSearch(type, trimmed),
    queryFn: async ({ pageParam }): Promise<SocialSearchResponse> => {
      const qs = pageParam
        ? `q=${encodeURIComponent(trimmed)}&type=${type}&limit=20&cursor=${encodeURIComponent(pageParam)}`
        : `q=${encodeURIComponent(trimmed)}&type=${type}&limit=20`;
      const json = await apiFetch<unknown>(`/social/search?${qs}`, { noCache: true });
      return SocialSearchResponseSchema.parse(json);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.type === 'USER') return lastPage.users?.nextCursor ?? undefined;
      return lastPage.posts?.nextCursor ?? undefined;
    },
    enabled: trimmed.length > 0,
  });
}

export function useSocialUser(userId: string) {
  return useQuery({
    queryKey: queryKeys.socialUser(userId),
    queryFn: async (): Promise<SocialUserProfile> => {
      const json = await apiFetch<unknown>(`/social/users/${userId}`, { noCache: true });
      return SocialUserProfileSchema.parse(json);
    },
    enabled: userId.length > 0,
  });
}

export function useSocialUserPosts(userId: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.socialUserPosts(userId),
    queryFn: async ({ pageParam }): Promise<PostListResponse> => {
      const qs = pageParam ? `limit=20&cursor=${encodeURIComponent(pageParam)}` : 'limit=20';
      const json = await apiFetch<unknown>(`/social/users/${userId}/posts?${qs}`, {
        noCache: true,
      });
      return PostListResponseSchema.parse(json);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: userId.length > 0,
  });
}
