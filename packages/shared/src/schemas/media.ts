import { z } from 'zod';
import { MediaStatusSchema } from '../enums';
import { DateTimeSchema, IdSchema } from './_common';

// ============================== Media 实体 ==============================

export const MediaSchema = z.object({
  id: IdSchema,
  ownerUserId: IdSchema,
  objectKey: z.string().min(1).max(256),
  mime: z.string().min(1).max(64),
  sizeBytes: z
    .number()
    .int()
    .nonnegative()
    .max(50 * 1024 * 1024),
  status: MediaStatusSchema,
  createdAt: DateTimeSchema,
});
export type Media = z.infer<typeof MediaSchema>;

export const MediaResponseSchema = MediaSchema;
export type MediaResponse = z.infer<typeof MediaResponseSchema>;

// ============================== Presigned 上传链路（ARCH §6） ==============================

export const UPLOAD_SCOPE_VALUES = ['MEAL_PHOTO', 'EXERCISE_MEDIA', 'AVATAR', 'REPORT'] as const;
export const UploadScopeSchema = z.enum(UPLOAD_SCOPE_VALUES);
export type UploadScope = z.infer<typeof UploadScopeSchema>;

/** POST /v1/uploads/sign */
export const PresignUploadRequestSchema = z.object({
  mime: z.string().min(1).max(64),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024),
  scope: UploadScopeSchema,
  /** 开发期：移动端指定 MinIO 可达地址（如 Android 模拟器 http://10.0.2.2:9000），服务端按此 host 签发预签名 URL */
  clientPublicEndpoint: z.string().url().optional(),
});
export type PresignUploadRequest = z.infer<typeof PresignUploadRequestSchema>;

export const PresignUploadResponseSchema = z.object({
  uploadUrl: z.string().url(),
  objectKey: z.string().min(1).max(256),
  expiresInSec: z.number().int().positive(),
});
export type PresignUploadResponse = z.infer<typeof PresignUploadResponseSchema>;

/** POST /v1/uploads/complete */
export const CompleteUploadRequestSchema = z.object({
  objectKey: z.string().min(1).max(256),
});
export type CompleteUploadRequest = z.infer<typeof CompleteUploadRequestSchema>;

export const CompleteUploadResponseSchema = z.object({
  mediaId: IdSchema,
});
export type CompleteUploadResponse = z.infer<typeof CompleteUploadResponseSchema>;
