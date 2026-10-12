import { Injectable, Logger } from '@nestjs/common';
import { AiCoreError, buildImageUnavailableUserText, describeCoachImages } from '@fitness/ai-core';

import { S3StorageService } from '../infra/storage/s3-storage.service';

@Injectable()
export class CoachImageContextService {
  private readonly logger = new Logger(CoachImageContextService.name);

  constructor(private readonly storage: S3StorageService) {}

  async augmentChatUserText(
    userId: string,
    userText: string,
    objectKeys: string[],
  ): Promise<{ latestUserText: string; imageObjectKeys: string[]; imageDescribeFailed: boolean }> {
    const imageObjectKeys = objectKeys.slice(0, 5);
    if (imageObjectKeys.length === 0) {
      return { latestUserText: userText, imageObjectKeys: [], imageDescribeFailed: false };
    }

    const imageUrls = await Promise.all(
      imageObjectKeys.map((objectKey) => this.resolveObjectKey(userId, objectKey)),
    );

    try {
      const described = await describeCoachImages({
        imageUrls,
        userText: userText || undefined,
      });
      return {
        latestUserText: described.augmentedUserText,
        imageObjectKeys,
        imageDescribeFailed: false,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`图片理解失败，降级为纯文字回复：${message}`.slice(0, 512));
      return {
        latestUserText: buildImageUnavailableUserText(imageObjectKeys.length, userText),
        imageObjectKeys,
        imageDescribeFailed: true,
      };
    }
  }

  private async resolveObjectKey(userId: string, objectKey: string): Promise<string> {
    const segments = objectKey.split('/');
    if (segments[1] !== userId) {
      throw new AiCoreError('AI_CORE_UNSUPPORTED_TASK', 'objectKey 与当前用户不匹配');
    }
    return this.storage.getObjectAsDataUrl(objectKey);
  }
}
