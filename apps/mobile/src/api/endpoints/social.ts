import type {
  CreatePostRequest,
  LikeResponse,
  PostListResponse,
  PostSummary,
} from '@fitness/shared';
import {
  CreatePostResponseSchema,
  LikeResponseSchema,
  MEDIA_MAX_SIZE_BYTES,
  PostListResponseSchema,
  PostSummarySchema,
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
      qc.removeQueries({ queryKey: queryKeys.socialPost(id) });
    },
  });
}

type SocialFeedInfinite = InfiniteData<PostListResponse, string | undefined>;

type LikeCacheSnapshot = {
  feed: SocialFeedInfinite | undefined;
  detail: PostSummary | undefined;
};

function patchPostLike(post: PostSummary, likedByMe: boolean): PostSummary {
  if (post.likedByMe === likedByMe) return post;
  return {
    ...post,
    likedByMe,
    likeCount: likedByMe ? post.likeCount + 1 : Math.max(0, post.likeCount - 1),
  };
}

function patchFeedLike(
  data: SocialFeedInfinite | undefined,
  postId: string,
  likedByMe: boolean,
): SocialFeedInfinite | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === postId ? patchPostLike(item, likedByMe) : item)),
    })),
  };
}

function snapshotAndPatchLike(
  qc: QueryClient,
  postId: string,
  likedByMe: boolean,
): LikeCacheSnapshot {
  const feed = qc.getQueryData<SocialFeedInfinite>(queryKeys.socialFeed);
  const detail = qc.getQueryData<PostSummary>(queryKeys.socialPost(postId));
  qc.setQueryData(queryKeys.socialFeed, patchFeedLike(feed, postId, likedByMe));
  if (detail) {
    qc.setQueryData(queryKeys.socialPost(postId), patchPostLike(detail, likedByMe));
  }
  return { feed, detail };
}

function restoreLikeSnapshot(qc: QueryClient, postId: string, snap: LikeCacheSnapshot): void {
  qc.setQueryData(queryKeys.socialFeed, snap.feed);
  if (snap.detail === undefined) {
    qc.removeQueries({ queryKey: queryKeys.socialPost(postId) });
  } else {
    qc.setQueryData(queryKeys.socialPost(postId), snap.detail);
  }
}

function applyLikeResponse(qc: QueryClient, res: LikeResponse): void {
  const feed = qc.getQueryData<SocialFeedInfinite>(queryKeys.socialFeed);
  if (feed) {
    qc.setQueryData(queryKeys.socialFeed, {
      ...feed,
      pages: feed.pages.map((page) => ({
        ...page,
        items: page.items.map((item) =>
          item.id === res.postId
            ? { ...item, likeCount: res.likeCount, likedByMe: res.likedByMe }
            : item,
        ),
      })),
    });
  }
  const detail = qc.getQueryData<PostSummary>(queryKeys.socialPost(res.postId));
  if (detail) {
    qc.setQueryData(queryKeys.socialPost(res.postId), {
      ...detail,
      likeCount: res.likeCount,
      likedByMe: res.likedByMe,
    });
  }
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
    onSettled: (_data, _err, postId) => {
      void qc.invalidateQueries({ queryKey: queryKeys.socialPost(postId) });
    },
  });
}

export function useLikePost() {
  return useLikeMutation(true);
}

export function useUnlikePost() {
  return useLikeMutation(false);
}
