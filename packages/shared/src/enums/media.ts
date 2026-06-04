import { z } from 'zod';

/** 媒体生命周期状态（ARCH §6 presigned 上传链路） */
export const MEDIA_STATUS_VALUES = ['PENDING', 'READY', 'DELETED'] as const;
export const MediaStatusSchema = z.enum(MEDIA_STATUS_VALUES);
export type MediaStatus = z.infer<typeof MediaStatusSchema>;
