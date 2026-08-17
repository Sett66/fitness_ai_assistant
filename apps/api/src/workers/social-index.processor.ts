import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrismaService } from '../infra/prisma/prisma.service';
import {
  SOCIAL_INDEX_QUEUE_NAME,
  type SocialIndexJobPayload,
} from '../infra/queue/queue.constants';
import { SEARCH_PROVIDER, type SearchProvider } from '../infra/search/search-provider';
import { fallbackDisplayName } from '../modules/social/social-display-name';

@Processor(SOCIAL_INDEX_QUEUE_NAME)
export class SocialIndexProcessor extends WorkerHost {
  private readonly logger = new Logger(SocialIndexProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SEARCH_PROVIDER) private readonly search: SearchProvider,
  ) {
    super();
  }

  async process(job: Job<SocialIndexJobPayload>): Promise<void> {
    const payload = job.data;
    switch (payload.op) {
      case 'INDEX_POST':
        await this.indexPost(payload.id);
        return;
      case 'DELETE_POST':
        await this.search.deletePost(payload.id);
        return;
      case 'INDEX_USER':
        await this.indexUser(payload.id);
        return;
      default: {
        const neverOp: never = payload;
        throw new Error(`未知社交索引操作: ${JSON.stringify(neverOp)}`);
      }
    }
  }

  private async indexPost(id: string): Promise<void> {
    const post = await this.prisma.client.post.findUnique({ where: { id } });
    if (
      !post ||
      post.deletedAt != null ||
      post.visibility !== 'PUBLIC' ||
      post.moderation === 'REJECTED'
    ) {
      await this.search.deletePost(id);
      return;
    }
    await this.search.indexPost({
      id: post.id,
      userId: post.userId,
      body: post.body,
      createdAtTs: post.createdAt.getTime(),
    });
  }

  private async indexUser(id: string): Promise<void> {
    const user = await this.prisma.client.user.findUnique({
      where: { id },
      select: { id: true, displayName: true, deletedAt: true },
    });
    if (!user || user.deletedAt != null) {
      this.logger.debug(`跳过 INDEX_USER：用户不存在或已删除 ${id}`);
      return;
    }
    await this.search.indexUser({
      id: user.id,
      displayName: fallbackDisplayName(user.id, user.displayName),
    });
  }
}
