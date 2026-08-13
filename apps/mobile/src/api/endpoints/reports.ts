import type {
  CreateHealthReportResponse,
  HealthReportDetail,
  HealthReportListResponse,
} from '@fitness/shared';
import {
  CreateHealthReportResponseSchema,
  HealthReportDetailSchema,
  HealthReportListResponseSchema,
  MEDIA_MAX_SIZE_BYTES,
} from '@fitness/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { DEV_STORAGE_PUBLIC_ENDPOINT } from '../../env';
import { apiFetch, uploadToPresignedUrl } from '../client';
import { presignRequestBody } from './media';
import { queryKeys } from '../queryKeys';

export function useReports() {
  return useQuery({
    queryKey: queryKeys.reports,
    queryFn: async (): Promise<HealthReportListResponse> => {
      const json = await apiFetch<unknown>('/reports', { noCache: true });
      return HealthReportListResponseSchema.parse(json);
    },
  });
}

export function useReportDetail(reportId: string, poll = false) {
  return useQuery({
    queryKey: queryKeys.report(reportId),
    queryFn: async (): Promise<HealthReportDetail> => {
      const json = await apiFetch<unknown>(`/reports/${reportId}`, { noCache: true });
      return HealthReportDetailSchema.parse(json);
    },
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!poll || !data) return false;
      return data.status === 'QUEUED' || data.status === 'RUNNING' ? 2000 : false;
    },
  });
}

export type ReportSourceFile = {
  uri: string;
  mime: string;
  sizeBytes: number;
  name?: string;
};

export function useCreateReportFromFiles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (files: ReportSourceFile[]): Promise<CreateHealthReportResponse> => {
      const sourceMediaIds: string[] = [];

      for (const file of files) {
        if (!file.uri) continue;
        if (file.sizeBytes > MEDIA_MAX_SIZE_BYTES) {
          throw new Error('文件过大，单文件不能超过 50MB');
        }
        const mime = file.mime || 'image/jpeg';
        const signed = await apiFetch<{ uploadUrl: string; objectKey: string }>('/uploads/sign', {
          method: 'POST',
          body: presignRequestBody('REPORT', {
            mime,
            sizeBytes: file.sizeBytes > 0 ? file.sizeBytes : 500_000,
          }),
        });

        await uploadToPresignedUrl(signed.uploadUrl, file.uri, mime);
        const completed = await apiFetch<{ mediaId: string }>('/uploads/complete', {
          method: 'POST',
          body: {
            objectKey: signed.objectKey,
            ...(DEV_STORAGE_PUBLIC_ENDPOINT
              ? { clientPublicEndpoint: DEV_STORAGE_PUBLIC_ENDPOINT }
              : {}),
          },
        });
        sourceMediaIds.push(completed.mediaId);
      }

      const created = await apiFetch<unknown>('/reports', {
        method: 'POST',
        body: { sourceMediaIds },
      });
      return CreateHealthReportResponseSchema.parse(created);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.reports });
    },
  });
}
