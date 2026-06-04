import type { UploadScope } from '@fitness/shared';
import { useMutation } from '@tanstack/react-query';

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
