import { Injectable } from '@nestjs/common';
import type { PostListResponse, SocialUserProfile } from '@fitness/shared';
import {
  IdSchema,
  SocialFeedQuerySchema,
  SocialUserProfileSchema,
  errorMessagesZhCN,
} from '@fitness/shared';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { S3StorageService } from '../../infra/storage/s3-storage.service';
import { PostsService } from './posts.service';
import { fallbackDisplayName } from './social-display-name';

const SOCIAL_READ_URL_TTL_SEC = 60 * 60;

const PUBLIC_POST_WHERE = {
  deletedAt: null,
  visibility: 'PUBLIC' as const,
  moderation: { not: 'REJECTED' as const },
};

@Injectable()
export class SocialUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
    private readonly posts: PostsService,
  ) {}

  async getProfile(userId: string): Promise<SocialUserProfile> {
    const id = parseWith(IdSchema, userId);
    const [profile] = await this.hydrateProfiles([id]);
    if (!profile) {
      throw new BizException('USER_NOT_FOUND', errorMessagesZhCN.USER_NOT_FOUND, 404);
    }
    return profile;
  }

  async listPosts(
    viewer: JwtUserPayload,
    userId: string,
    query: unknown,
  ): Promise<PostListResponse> {
    const id = parseWith(IdSchema, userId);
    await this.assertUserExists(id);

    const { cursor, limit } = parseWith(SocialFeedQuerySchema, query);
    const pageLimit = limit ?? 20;
    const isSelf = id === viewer.userId;

    const rows = await this.prisma.client.post.findMany({
      where: {
        userId: id,
        deletedAt: null,
        ...(isSelf ? {} : { visibility: 'PUBLIC', moderation: { not: 'REJECTED' } }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageLimit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const hasMore = rows.length > pageLimit;
    const page = hasMore ? rows.slice(0, pageLimit) : rows;
    const items = await this.posts.mapPosts(page, viewer.userId);
    return {
      items,
      nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async hydrateProfiles(ids: string[]): Promise<SocialUserProfile[]> {
    if (ids.length === 0) return [];

    const users = await this.prisma.client.user.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        displayName: true,
        createdAt: true,
        avatarMedia: { select: { objectKey: true } },
      },
    });

    const counts = await this.prisma.client.post.groupBy({
      by: ['userId'],
      where: { userId: { in: ids }, ...PUBLIC_POST_WHERE },
      _count: { _all: true },
    });
    const postCountByUser = new Map(counts.map((row) => [row.userId, row._count._all]));

    const avatarUrls = new Map<string, string>();
    await Promise.all(
      users.map(async (user) => {
        if (!user.avatarMedia) return;
        avatarUrls.set(
          user.id,
          await this.storage.presignGet(user.avatarMedia.objectKey, SOCIAL_READ_URL_TTL_SEC),
        );
      }),
    );

    const byId = new Map(
      users.map((user) => [
        user.id,
        SocialUserProfileSchema.parse({
          id: user.id,
          displayName: fallbackDisplayName(user.id, user.displayName),
          avatarUrl: avatarUrls.get(user.id) ?? null,
          postCount: postCountByUser.get(user.id) ?? 0,
          joinedAt: user.createdAt,
        }),
      ]),
    );

    return ids.flatMap((id) => {
      const profile = byId.get(id);
      return profile ? [profile] : [];
    });
  }

  private async assertUserExists(userId: string): Promise<void> {
    const user = await this.prisma.client.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new BizException('USER_NOT_FOUND', errorMessagesZhCN.USER_NOT_FOUND, 404);
    }
  }
}
