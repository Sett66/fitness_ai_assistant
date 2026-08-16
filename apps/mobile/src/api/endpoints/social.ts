import type { CreatePostRequest, PostListResponse, PostSummary } from '@fitness/shared';
import {
  CreatePostResponseSchema,
  MEDIA_MAX_SIZE_BYTES,
  PostListResponseSchema,
  PostSummarySchema,
} from '@fitness/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
