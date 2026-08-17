import { Injectable } from '@nestjs/common';
import type { Comment } from '@fitness/db';
import type { CommentLikeResponse, CommentListResponse, CommentSummary } from '@fitness/shared';
import {
  CommentListQuerySchema,
  CommentSummarySchema,
  CreateCommentRequestSchema,
  errorMessagesZhCN,
} from '@fitness/shared';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { isUniqueViolation } from './is-unique-violation';
import { PostsService } from './posts.service';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
  ) {}

  async list(user: JwtUserPayload, postId: string, query: unknown): Promise<CommentListResponse> {
    await this.posts.assertVisiblePost(user.userId, postId);
    const { cursor, limit } = parseWith(CommentListQuerySchema, query);
    const pageLimit = limit ?? 20;

    const rows = await this.prisma.client.comment.findMany({
      where: { postId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: pageLimit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    const hasMore = rows.length > pageLimit;
    const page = hasMore ? rows.slice(0, pageLimit) : rows;
    const items = await this.mapComments(page, user.userId);
    return {
      items,
      nextCursor: hasMore && page.length > 0 ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async create(user: JwtUserPayload, postId: string, body: unknown): Promise<CommentSummary> {
    await this.posts.assertVisiblePost(user.userId, postId);
    const input = parseWith(CreateCommentRequestSchema, body);

    // SOCIAL-06: 关键词校验（命中直接 400，不落库）
    // 评论不进检索索引（ADR 0011 §9）

    if (input.parentId) {
      const parent = await this.prisma.client.comment.findFirst({
        where: { id: input.parentId, postId, deletedAt: null },
        select: { id: true },
      });
      if (!parent) {
        throw new BizException(
          'SOCIAL_COMMENT_NOT_FOUND',
          errorMessagesZhCN.SOCIAL_COMMENT_NOT_FOUND,
          404,
        );
      }
    }

    const created = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.comment.create({
        data: {
          postId,
          userId: user.userId,
          body: input.body,
          parentId: input.parentId,
        },
      });
      await tx.post.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      });
      return row;
    });

    const [mapped] = await this.mapComments([created], user.userId);
    if (!mapped) {
      throw new BizException(
        'SOCIAL_COMMENT_NOT_FOUND',
        errorMessagesZhCN.SOCIAL_COMMENT_NOT_FOUND,
        404,
      );
    }
    return mapped;
  }

  /**
   * 幂等点赞。P2002 必须让交互式事务整体失败后再在事务外读计数：
   * Postgres 遇唯一冲突会 abort 当前事务，catch 后继续用同一个 `tx` 会 500。
   */
  async like(user: JwtUserPayload, commentId: string): Promise<CommentLikeResponse> {
    const comment = await this.assertVisibleComment(user.userId, commentId);

    try {
      const updated = await this.prisma.client.$transaction(async (tx) => {
        await tx.commentReaction.create({
          data: { commentId, userId: user.userId },
        });
        return tx.comment.update({
          where: { id: commentId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        });
      });
      return { commentId, likeCount: updated.likeCount, likedByMe: true };
    } catch (err) {
      if (isUniqueViolation(err)) {
        const row = await this.prisma.client.comment.findUniqueOrThrow({
          where: { id: comment.id },
          select: { likeCount: true },
        });
        return { commentId, likeCount: row.likeCount, likedByMe: true };
      }
      throw err;
    }
  }

  async unlike(user: JwtUserPayload, commentId: string): Promise<CommentLikeResponse> {
    await this.assertVisibleComment(user.userId, commentId);

    const updated = await this.prisma.client.$transaction(async (tx) => {
      const removed = await tx.commentReaction.deleteMany({
        where: { commentId, userId: user.userId },
      });
      if (removed.count === 0) {
        return tx.comment.findUniqueOrThrow({
          where: { id: commentId },
          select: { likeCount: true },
        });
      }
      return tx.comment.update({
        where: { id: commentId },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });
    });

    return { commentId, likeCount: updated.likeCount, likedByMe: false };
  }

  async remove(user: JwtUserPayload, id: string): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      const result = await tx.comment.updateMany({
        where: { id, userId: user.userId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      if (result.count === 0) {
        throw new BizException(
          'SOCIAL_COMMENT_NOT_FOUND',
          errorMessagesZhCN.SOCIAL_COMMENT_NOT_FOUND,
          404,
        );
      }
      const row = await tx.comment.findUniqueOrThrow({
        where: { id },
        select: { postId: true },
      });
      await tx.post.update({
        where: { id: row.postId },
        data: { commentCount: { decrement: 1 } },
      });
    });
  }

  async mapComments(rows: Comment[], viewerId: string): Promise<CommentSummary[]> {
    if (rows.length === 0) return [];

    const parentIds = [
      ...new Set(rows.map((row) => row.parentId).filter((id): id is string => id != null)),
    ];
    const [parents, likedRows] = await Promise.all([
      parentIds.length > 0
        ? this.prisma.client.comment.findMany({
            where: { id: { in: parentIds }, deletedAt: null },
            select: { id: true, userId: true },
          })
        : Promise.resolve([] as Array<{ id: string; userId: string }>),
      this.prisma.client.commentReaction.findMany({
        where: { commentId: { in: rows.map((row) => row.id) }, userId: viewerId },
        select: { commentId: true },
      }),
    ]);
    const parentById = new Map(parents.map((parent) => [parent.id, parent]));
    const likedIds = new Set(likedRows.map((row) => row.commentId));

    const authorIds = [...rows.map((row) => row.userId), ...parents.map((parent) => parent.userId)];
    const authors = await this.posts.resolveAuthors(authorIds);

    return rows.map((row) => {
      const parent = row.parentId ? parentById.get(row.parentId) : undefined;
      const replyToName = parent ? (authors.get(parent.userId)?.displayName ?? null) : null;
      const author = authors.get(row.userId) ?? {
        id: row.userId,
        displayName: `健身用户${row.userId.slice(-4)}`,
        avatarUrl: null,
      };

      return CommentSummarySchema.parse({
        id: row.id,
        postId: row.postId,
        author,
        body: row.body,
        parentId: row.parentId,
        replyToName,
        likeCount: row.likeCount,
        likedByMe: likedIds.has(row.id),
        isMine: row.userId === viewerId,
        createdAt: row.createdAt,
      });
    });
  }

  private async assertVisibleComment(userId: string, commentId: string): Promise<Comment> {
    const comment = await this.prisma.client.comment.findFirst({
      where: { id: commentId, deletedAt: null },
    });
    if (!comment) {
      throw new BizException(
        'SOCIAL_COMMENT_NOT_FOUND',
        errorMessagesZhCN.SOCIAL_COMMENT_NOT_FOUND,
        404,
      );
    }
    await this.posts.assertVisiblePost(userId, comment.postId);
    return comment;
  }
}
