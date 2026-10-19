import { Injectable } from '@nestjs/common';
import type { Comment } from '@fitness/db';
import type { CommentListResponse, CommentSummary } from '@fitness/shared';
import {
  CommentListQuerySchema,
  CommentSummarySchema,
  CreateCommentRequestSchema,
  LikeWriteRequestSchema,
  errorMessagesZhCN,
  findBannedKeyword,
} from '@fitness/shared';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PostsService } from './posts.service';
import { accessLikeState } from './like-state';

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
    if (findBannedKeyword(input.body)) {
      throw new BizException(
        'SOCIAL_CONTENT_REJECTED',
        errorMessagesZhCN.SOCIAL_CONTENT_REJECTED,
        400,
      );
    }

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

  async getLikeState(user: JwtUserPayload, commentId: string) {
    await this.assertVisibleComment(user.userId, commentId);
    return accessLikeState(this.prisma.client, user.userId, { kind: 'comment', id: commentId });
  }

  async setLikeState(user: JwtUserPayload, commentId: string, likedByMe: boolean, body: unknown) {
    const { expectedRevision } = parseWith(LikeWriteRequestSchema, body);
    await this.assertVisibleComment(user.userId, commentId);
    return accessLikeState(
      this.prisma.client,
      user.userId,
      { kind: 'comment', id: commentId },
      {
        expectedRevision,
        likedByMe,
      },
    );
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
