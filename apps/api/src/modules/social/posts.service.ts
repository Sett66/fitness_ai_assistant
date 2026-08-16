import { Injectable } from '@nestjs/common';
import type { Media, Post } from '@fitness/db';
import type { PostListResponse, PostSummary } from '@fitness/shared';
import {
  CreatePostRequestSchema,
  PostSummarySchema,
  SocialFeedQuerySchema,
  errorMessagesZhCN,
} from '@fitness/shared';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { S3StorageService } from '../../infra/storage/s3-storage.service';

const SOCIAL_READ_URL_TTL_SEC = 60 * 60;

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
  ) {}

  async create(user: JwtUserPayload, body: unknown): Promise<PostSummary> {
    if (isFollowersVisibility(body)) {
      throw new BizException(
        'SOCIAL_VISIBILITY_UNSUPPORTED',
        errorMessagesZhCN.SOCIAL_VISIBILITY_UNSUPPORTED,
        400,
      );
    }

    const input = parseWith(CreatePostRequestSchema, body);
    const mediaIds = input.mediaIds ?? [];

    // SOCIAL-06: 关键词校验 + 审核入队
    await this.assertOwnedReadyImages(user.userId, mediaIds);

    const post = await this.prisma.client.post.create({
      data: {
        userId: user.userId,
        body: input.body,
        mediaIds,
        visibility: input.visibility,
      },
    });

    // SOCIAL-04: enqueue INDEX_POST
    const [mapped] = await this.mapPosts([post], user.userId);
    if (!mapped) {
      throw new BizException('SOCIAL_POST_NOT_FOUND', errorMessagesZhCN.SOCIAL_POST_NOT_FOUND, 404);
    }
    return mapped;
  }

  async listFeed(user: JwtUserPayload, query: unknown): Promise<PostListResponse> {
    const { cursor, limit } = parseWith(SocialFeedQuerySchema, query);
    const pageLimit = limit ?? 20;

    const rows = await this.prisma.client.post.findMany({
      where: { deletedAt: null, visibility: 'PUBLIC', moderation: { not: 'REJECTED' } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageLimit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const hasMore = rows.length > pageLimit;
    const page = hasMore ? rows.slice(0, pageLimit) : rows;
    const items = await this.mapPosts(page, user.userId);
    return {
      items,
      nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async getById(user: JwtUserPayload, id: string): Promise<PostSummary> {
    const post = await this.prisma.client.post.findFirst({
      where: { id, deletedAt: null },
    });
    if (!post || !this.canView(post, user.userId)) {
      throw new BizException('SOCIAL_POST_NOT_FOUND', errorMessagesZhCN.SOCIAL_POST_NOT_FOUND, 404);
    }
    const [mapped] = await this.mapPosts([post], user.userId);
    if (!mapped) {
      throw new BizException('SOCIAL_POST_NOT_FOUND', errorMessagesZhCN.SOCIAL_POST_NOT_FOUND, 404);
    }
    return mapped;
  }

  async softDelete(user: JwtUserPayload, id: string): Promise<void> {
    const result = await this.prisma.client.post.updateMany({
      where: { id, userId: user.userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw new BizException('SOCIAL_POST_NOT_FOUND', errorMessagesZhCN.SOCIAL_POST_NOT_FOUND, 404);
    }
    // SOCIAL-04: enqueue DELETE_POST
  }

  async mapPosts(rows: Post[], viewerId: string): Promise<PostSummary[]> {
    if (rows.length === 0) return [];

    const userIds = [...new Set(rows.map((row) => row.userId))];
    const mediaIds = [...new Set(rows.flatMap((row) => row.mediaIds))];

    const [authors, media] = await Promise.all([
      this.prisma.client.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, displayName: true, avatarMedia: { select: { objectKey: true } } },
      }),
      mediaIds.length > 0
        ? this.prisma.client.media.findMany({
            where: { id: { in: mediaIds }, status: 'READY' },
          })
        : Promise.resolve([] as Media[]),
    ]);

    const authorById = new Map(authors.map((author) => [author.id, author]));

    const avatarUrls = new Map<string, string>();
    await Promise.all(
      authors.map(async (author) => {
        if (!author.avatarMedia) return;
        avatarUrls.set(
          author.id,
          await this.storage.presignGet(author.avatarMedia.objectKey, SOCIAL_READ_URL_TTL_SEC),
        );
      }),
    );

    const imageUrlByMediaId = new Map<string, string>();
    await Promise.all(
      media.map(async (item) => {
        imageUrlByMediaId.set(
          item.id,
          await this.storage.presignGet(item.objectKey, SOCIAL_READ_URL_TTL_SEC),
        );
      }),
    );

    return rows.map((row) => {
      const isMine = row.userId === viewerId;
      const author = authorById.get(row.userId);
      const imageUrls = row.mediaIds
        .map((mediaId) => imageUrlByMediaId.get(mediaId))
        .filter((url): url is string => url != null);

      return PostSummarySchema.parse({
        id: row.id,
        author: {
          id: row.userId,
          displayName: fallbackDisplayName(row.userId, author?.displayName),
          avatarUrl: avatarUrls.get(row.userId) ?? null,
        },
        body: row.body,
        imageUrls,
        visibility: row.visibility,
        moderation: row.moderation,
        moderationReason: isMine ? (row.moderationReason ?? null) : null,
        likeCount: row.likeCount,
        commentCount: row.commentCount,
        likedByMe: false,
        isMine,
        createdAt: row.createdAt,
      });
    });
  }

  private canView(post: Post, viewerId: string): boolean {
    if (post.userId === viewerId) return true;
    return post.visibility === 'PUBLIC' && post.moderation !== 'REJECTED';
  }

  private async assertOwnedReadyImages(userId: string, mediaIds: string[]): Promise<void> {
    if (mediaIds.length === 0) return;
    const media = await this.prisma.client.media.findMany({
      where: { id: { in: mediaIds }, ownerUserId: userId, status: 'READY' },
    });
    if (media.length !== mediaIds.length || media.some((item) => !item.mime.startsWith('image/'))) {
      throw new BizException('SOCIAL_MEDIA_INVALID', errorMessagesZhCN.SOCIAL_MEDIA_INVALID, 400);
    }
  }
}

function fallbackDisplayName(userId: string, displayName: string | null | undefined): string {
  const trimmed = displayName?.trim();
  if (trimmed) return trimmed;
  return `健身用户${userId.slice(-4)}`;
}

function isFollowersVisibility(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body != null &&
    'visibility' in body &&
    (body as { visibility?: unknown }).visibility === 'FOLLOWERS'
  );
}
