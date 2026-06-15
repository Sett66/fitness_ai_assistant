import { Injectable } from '@nestjs/common';
import { AiCoreError, describeCoachImages } from '@fitness/ai-core';

import { S3StorageService } from '../infra/storage/s3-storage.service';

@Injectable()
export class CoachImageContextService {
  constructor(private readonly storage: S3StorageService) {}

  async augmentChatUserText(
    userId: string,
    userText: string,
    objectKeys: string[],
  ): Promise<{ latestUserText: string; imageObjectKeys: string[] }> {
    const imageObjectKeys = objectKeys.slice(0, 5);
    if (imageObjectKeys.length === 0) {
      return { latestUserText: userText, imageObjectKeys: [] };
    }

    const imageUrls = await Promise.all(
      imageObjectKeys.map((objectKey) => this.resolveObjectKey(userId, objectKey)),
    );

    try {
      const described = await describeCoachImages({
        imageUrls,
        userText: userText || undefined,
      });
      return { latestUserText: described.augmentedUserText, imageObjectKeys };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AiCoreError('AI_CORE_PROVIDER_ERROR', `图片理解失败：${message}`.slice(0, 512));
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
