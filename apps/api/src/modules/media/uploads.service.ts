import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { CompleteUploadResponse, PresignUploadResponse } from '@fitness/shared';
import {
  CompleteUploadRequestSchema,
  MEDIA_MAX_SIZE_BYTES,
  PresignUploadRequestSchema,
} from '@fitness/shared';
import type { UploadScope } from '@fitness/shared';
import { errorMessagesZhCN } from '@fitness/shared';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import { type S3StorageService } from '../../infra/storage/s3-storage.service';
import { type PrismaService } from '../../infra/prisma/prisma.service';

const PRESIGN_TTL_SEC = 15 * 60;

/** scope → URL 路径前缀 */
const scopePrefix: Record<UploadScope, string> = {
  MEAL_PHOTO: 'meal',
  EXERCISE_MEDIA: 'exercise',
  AVATAR: 'avatar',
  REPORT: 'report',
};

@Injectable()
export class UploadsService {
  constructor(
    private readonly storage: S3StorageService,
    private readonly prisma: PrismaService,
  ) {}

  async presign(user: JwtUserPayload, body: unknown): Promise<PresignUploadResponse> {
    const input = parseWith(PresignUploadRequestSchema, body);
    if (input.sizeBytes > MEDIA_MAX_SIZE_BYTES) {
      throw new BizException('MEDIA_TOO_LARGE', errorMessagesZhCN.MEDIA_TOO_LARGE, 400);
    }
    assertMimeForScope(input.scope, input.mime);
    const key = `${scopePrefix[input.scope]}/${user.userId}/${randomUUID()}`;
    const publicEndpoint =
      process.env.NODE_ENV === 'development' ? input.clientPublicEndpoint : undefined;

    const uploadUrl = await this.storage.presignPut({
      objectKey: key,
      mime: input.mime,
      expiresSec: PRESIGN_TTL_SEC,
      publicEndpoint,
    });

    return { uploadUrl, objectKey: key, expiresInSec: PRESIGN_TTL_SEC };
  }

  async complete(user: JwtUserPayload, body: unknown): Promise<CompleteUploadResponse> {
    const input = parseWith(CompleteUploadRequestSchema, body);
    const segments = input.objectKey.split('/');
    const ownerSegment = segments[1];
    if (segments.length < 3 || !segments[0] || ownerSegment !== user.userId) {
      throw new BizException('VALIDATION_FAILED', errorMessagesZhCN.MEDIA_UPLOAD_FAILED, 400, {
        objectKey: 'invalid',
      });
    }
    const head = await this.storage.head(input.objectKey);
    if (!head.exists) {
      throw new BizException('MEDIA_NOT_FOUND', errorMessagesZhCN.MEDIA_NOT_FOUND, 404);
    }
    const mimeFromHead = head.contentType ?? mimeFromExtension(input.objectKey);
    const sizeBytes = typeof head.sizeBytes === 'number' && head.sizeBytes > 0 ? head.sizeBytes : 1;

    const media = await this.prisma.client.media.create({
      data: {
        ownerUserId: user.userId,
        objectKey: input.objectKey,
        mime: mimeFromHead,
        sizeBytes,
        status: 'READY',
      },
    });

    return { mediaId: media.id };
  }
}

function assertMimeForScope(scope: UploadScope, mime: string): void {
  const m = mime.toLowerCase();

  const isImage = m.startsWith('image/');
  const isPdf = m === 'application/pdf';

  if (scope === 'REPORT') {
    if (!isPdf && !isImage) {
      throw new BizException('MEDIA_MIME_REJECTED', errorMessagesZhCN.MEDIA_MIME_REJECTED, 400);
    }
    return;
  }

  // meal / avatar / exercise: 只允许图片为主；运动媒体允许常见视频格式
  if (scope === 'EXERCISE_MEDIA') {
    const isVideo =
      m.startsWith('video/mp4') || m.startsWith('video/quicktime') || m.startsWith('video/webm');
    if (!isImage && !isVideo) {
      throw new BizException('MEDIA_MIME_REJECTED', errorMessagesZhCN.MEDIA_MIME_REJECTED, 400);
    }
    return;
  }

  if (!isImage) {
    throw new BizException('MEDIA_MIME_REJECTED', errorMessagesZhCN.MEDIA_MIME_REJECTED, 400);
  }
}

function mimeFromExtension(objectKey: string): string {
  const lower = objectKey.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  return 'application/octet-stream';
}
