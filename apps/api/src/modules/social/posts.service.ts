import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Media, Post } from '@fitness/db';
import type { LikeResponse, PostListResponse, PostSummary, SocialAuthor } from '@fitness/shared';
import {
  CreatePostRequestSchema,
  PostSummarySchema,
  SocialFeedQuerySchema,
  errorMessagesZhCN,
} from '@fitness/shared';
import type { Queue } from 'bullmq';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  SOCIAL_INDEX_JOB_NAME,
  SOCIAL_INDEX_JOB_OPTIONS,
  SOCIAL_INDEX_QUEUE_NAME,
  type SocialIndexJobPayload,
} from '../../infra/queue/queue.constants';
import { S3StorageService } from '../../infra/storage/s3-storage.service';
import { isUniqueViolation } from './is-unique-violation';
import { fallbackDisplayName } from './social-display-name';

const SOCIAL_READ_URL_TTL_SEC = 60 * 60;

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
    @InjectQueue(SOCIAL_INDEX_QUEUE_NAME) private readonly indexQueue: Queue<SocialIndexJobPayload>,
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

    await this.indexQueue.add(
      SOCIAL_INDEX_JOB_NAME,
      { op: 'INDEX_POST', id: post.id },
      SOCIAL_INDEX_JOB_OPTIONS,
    );
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
    const post = await this.assertVisiblePost(user.userId, id);
    const [mapped] = await this.mapPosts([post], user.userId);
    if (!mapped) {
      throw new BizException('SOCIAL_POST_NOT_FOUND', errorMessagesZhCN.SOCIAL_POST_NOT_FOUND, 404);
    }
    return mapped;
  }

  /**
   * 幂等点赞。P2002 必须让交互式事务整体失败后再在事务外读计数：
   * Postgres 遇唯一冲突会 abort 当前事务，catch 后继续用同一个 `tx` 会 500。
   */
  async like(user: JwtUserPayload, postId: string): Promise<LikeResponse> {
    await this.assertVisiblePost(user.userId, postId);

    try {
      const updated = await this.prisma.client.$transaction(async (tx) => {
        await tx.reaction.create({ data: { postId, userId: user.userId, kind: 'LIKE' } });
        return tx.post.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        });
      });
      return { postId, likeCount: updated.likeCount, likedByMe: true };
    } catch (err) {
      if (isUniqueViolation(err)) {
        const post = await this.prisma.client.post.findUniqueOrThrow({
          where: { id: postId },
          select: { likeCount: true },
        });
        return { postId, likeCount: post.likeCount, likedByMe: true };
      }
      throw err;
    }
  }

  async unlike(user: JwtUserPayload, postId: string): Promise<LikeResponse> {
    await this.assertVisiblePost(user.userId, postId);

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const removed = await tx.reaction.deleteMany({
        where: { postId, userId: user.userId },
      });
      if (removed.count === 0) {
        return tx.post.findUniqueOrThrow({
          where: { id: postId },
          select: { likeCount: true },
        });
      }
      return tx.post.update({
        where: { id: postId },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });
    });

    return { postId, likeCount: updated.likeCount, likedByMe: false };
  }

  async assertVisiblePost(userId: string, postId: string): Promise<Post> {
    const post = await this.prisma.client.post.findFirst({
      where: { id: postId, deletedAt: null },
    });
    if (!post || !this.canView(post, userId)) {
      throw new BizException('SOCIAL_POST_NOT_FOUND', errorMessagesZhCN.SOCIAL_POST_NOT_FOUND, 404);
    }
    return post;
  }

  async softDelete(user: JwtUserPayload, id: string): Promise<void> {
    const result = await this.prisma.client.post.updateMany({
      where: { id, userId: user.userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw new BizException('SOCIAL_POST_NOT_FOUND', errorMessagesZhCN.SOCIAL_POST_NOT_FOUND, 404);
    }
    await this.indexQueue.add(
      SOCIAL_INDEX_JOB_NAME,
      { op: 'DELETE_POST', id },
      SOCIAL_INDEX_JOB_OPTIONS,
    );
  }

  async resolveAuthors(userIds: string[]): Promise<Map<string, SocialAuthor>> {
    const unique = [...new Set(userIds)];
    const byId = new Map<string, SocialAuthor>();
    if (unique.length === 0) return byId;

    const users = await this.prisma.client.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, displayName: true, avatarMedia: { select: { objectKey: true } } },
    });
    const userById = new Map(users.map((user) => [user.id, user]));

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

    for (const id of unique) {
      const user = userById.get(id);
      byId.set(id, {
        id,
        displayName: fallbackDisplayName(id, user?.displayName),
        avatarUrl: avatarUrls.get(id) ?? null,
      });
    }
    return byId;
  }

  async mapPosts(rows: Post[], viewerId: string): Promise<PostSummary[]> {
    if (rows.length === 0) return [];

    const userIds = [...new Set(rows.map((row) => row.userId))];
    const mediaIds = [...new Set(rows.flatMap((row) => row.mediaIds))];

    const [authors, media, likedRows] = await Promise.all([
      this.resolveAuthors(userIds),
      mediaIds.length > 0
        ? this.prisma.client.media.findMany({
            where: { id: { in: mediaIds }, status: 'READY' },
          })
        : Promise.resolve([] as Media[]),
      this.prisma.client.reaction.findMany({
        where: { postId: { in: rows.map((row) => row.id) }, userId: viewerId, kind: 'LIKE' },
        select: { postId: true },
      }),
    ]);
    const likedIds = new Set(likedRows.map((row) => row.postId));

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
      const imageUrls = row.mediaIds
        .map((mediaId) => imageUrlByMediaId.get(mediaId))
        .filter((url): url is string => url != null);

      return PostSummarySchema.parse({
        id: row.id,
        author: authors.get(row.userId) ?? {
          id: row.userId,
          displayName: fallbackDisplayName(row.userId, null),
          avatarUrl: null,
        },
        body: row.body,
        imageUrls,
        visibility: row.visibility,
        moderation: row.moderation,
        moderationReason: isMine ? (row.moderationReason ?? null) : null,
        likeCount: row.likeCount,
        commentCount: row.commentCount,
        likedByMe: likedIds.has(row.id),
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

function isFollowersVisibility(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body != null &&
    'visibility' in body &&
    (body as { visibility?: unknown }).visibility === 'FOLLOWERS'
  );
}
