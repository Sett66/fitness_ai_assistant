import type { UploadScope } from '@fitness/shared';
import { ReadUploadUrlsResponseSchema } from '@fitness/shared';
import { useMutation, useQuery } from '@tanstack/react-query';

import { DEV_STORAGE_PUBLIC_ENDPOINT } from '../../env';
import { apiFetch, uploadToPresignedUrl } from '../client';

export function presignRequestBody(
  scope: UploadScope,
  params: { mime: string; sizeBytes: number },
) {
  return {
    mime: params.mime,
    sizeBytes: params.sizeBytes,
    scope,
    ...(DEV_STORAGE_PUBLIC_ENDPOINT ? { clientPublicEndpoint: DEV_STORAGE_PUBLIC_ENDPOINT } : {}),
  };
}

export function useUploadMedia(scope: UploadScope) {
  return useMutation({
    mutationFn: async (params: { fileUri: string; mime: string; sizeBytes: number }) => {
      const signed = await apiFetch<{ uploadUrl: string; objectKey: string }>('/uploads/sign', {
        method: 'POST',
        body: presignRequestBody(scope, params),
      });

      await uploadToPresignedUrl(signed.uploadUrl, params.fileUri, params.mime);
      const completed = await apiFetch<{ mediaId: string }>('/uploads/complete', {
        method: 'POST',
        body: { objectKey: signed.objectKey },
      });
      return completed.mediaId;
    },
  });
}

export function useUploadAvatar() {
  return useUploadMedia('AVATAR');
}

export async function fetchUploadReadUrls(objectKeys: string[]) {
  if (objectKeys.length === 0) {
    return ReadUploadUrlsResponseSchema.parse({ items: [] });
  }
  const json = await apiFetch<unknown>('/uploads/read-urls', {
    method: 'POST',
    body: {
      objectKeys,
      ...(DEV_STORAGE_PUBLIC_ENDPOINT ? { clientPublicEndpoint: DEV_STORAGE_PUBLIC_ENDPOINT } : {}),
    },
  });
  return ReadUploadUrlsResponseSchema.parse(json);
}

export function uploadReadUrlsQueryKey(objectKeys: string[]) {
  return ['upload-read-urls', DEV_STORAGE_PUBLIC_ENDPOINT ?? 'default', ...objectKeys] as const;
}

/** 比服务端 READ_URL_TTL_SEC 略短，到期前自动重新签发 */
const UPLOAD_READ_URL_STALE_MS = 55 * 60 * 1000;

export function useUploadReadUrls(objectKeys: string[]) {
  const keys = objectKeys.filter(Boolean);
  return useQuery({
    queryKey: uploadReadUrlsQueryKey(keys),
    queryFn: () => fetchUploadReadUrls(keys),
    enabled: keys.length > 0,
    staleTime: UPLOAD_READ_URL_STALE_MS,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}
