import type { Comment } from '@fitness/db';
import { Prisma } from '@fitness/db';
import type { SocialAuthor } from '@fitness/shared';

import { BizException } from '../../common/exceptions/biz-exception';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CommentsService } from './comments.service';
import { PostsService } from './posts.service';

const USER_A = 'user-a-xxxxxxxx';
const USER_B = 'user-b-xxxxxxxx';
const POST_ID = 'post-id-xxxxxxx';
const COMMENT_ID = 'comment-id-xxx';
const PARENT_ID = 'parent-id-xxxx';

function commentRow(overrides: Partial<Comment> = {}): Comment {
  return {
    id: COMMENT_ID,
    postId: POST_ID,
    userId: USER_A,
    body: 'nice',
    parentId: null,
    likeCount: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function author(id: string, displayName: string): SocialAuthor {
  return { id, displayName, avatarUrl: null };
}

function createP2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  });
}

type TxMocks = {
  comment: {
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  commentReaction: { create: jest.Mock; deleteMany: jest.Mock };
  post: { update: jest.Mock };
};

function createService() {
  const tx: TxMocks = {
    comment: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    commentReaction: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    post: {
      update: jest.fn(),
    },
  };

  const prisma = {
    client: {
      comment: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      commentReaction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(),
    },
  };

  const posts = {
    assertVisiblePost: jest.fn().mockResolvedValue({ id: POST_ID }),
    resolveAuthors: jest.fn().mockResolvedValue(new Map([[USER_A, author(USER_A, 'Alice')]])),
  };

  const service = new CommentsService(
    prisma as unknown as PrismaService,
    posts as unknown as PostsService,
  );

  return { service, prisma, posts, tx };
}

describe('CommentsService create / remove', () => {
  it('发表评论后在同一事务内 increment commentCount', async () => {
    const { service, prisma, tx } = createService();
    const created = commentRow();
    tx.comment.create.mockResolvedValue(created);
    tx.post.update.mockResolvedValue({ commentCount: 1 });
    prisma.client.$transaction.mockImplementation(async (fn: (client: TxMocks) => unknown) =>
      fn(tx),
    );

    const result = await service.create({ userId: USER_A }, POST_ID, { body: 'nice' });

    expect(tx.comment.create).toHaveBeenCalledWith({
      data: { postId: POST_ID, userId: USER_A, body: 'nice', parentId: undefined },
    });
    expect(tx.post.update).toHaveBeenCalledWith({
      where: { id: POST_ID },
      data: { commentCount: { increment: 1 } },
    });
    expect(result.id).toBe(COMMENT_ID);
    expect(result.isMine).toBe(true);
    expect(result.likeCount).toBe(0);
    expect(result.likedByMe).toBe(false);
  });

  it('命中拦截词返回 SOCIAL_CONTENT_REJECTED 且不写库', async () => {
    const { service, prisma } = createService();

    await expect(
      service.create({ userId: USER_A }, POST_ID, { body: 'this is abuseword' }),
    ).rejects.toMatchObject({
      code: 'SOCIAL_CONTENT_REJECTED',
      httpStatus: 400,
    });
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });

  it('传入他帖的 parentId 返回 SOCIAL_COMMENT_NOT_FOUND 且不写库', async () => {
    const { service, prisma } = createService();
    prisma.client.comment.findFirst.mockResolvedValue(null);

    await expect(
      service.create({ userId: USER_A }, POST_ID, { body: 'reply', parentId: PARENT_ID }),
    ).rejects.toMatchObject({
      code: 'SOCIAL_COMMENT_NOT_FOUND',
      httpStatus: 404,
    });
    expect(prisma.client.comment.findFirst).toHaveBeenCalledWith({
      where: { id: PARENT_ID, postId: POST_ID, deletedAt: null },
      select: { id: true },
    });
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });

  it('软删成功才 decrement；重复删除不减计数', async () => {
    const { service, prisma, tx } = createService();
    tx.comment.updateMany.mockResolvedValue({ count: 1 });
    tx.comment.findUniqueOrThrow.mockResolvedValue({ postId: POST_ID });
    tx.post.update.mockResolvedValue({ commentCount: 0 });
    prisma.client.$transaction.mockImplementation(async (fn: (client: TxMocks) => unknown) =>
      fn(tx),
    );

    await service.remove({ userId: USER_A }, COMMENT_ID);

    expect(tx.post.update).toHaveBeenCalledWith({
      where: { id: POST_ID },
      data: { commentCount: { decrement: 1 } },
    });

    tx.comment.updateMany.mockResolvedValue({ count: 0 });
    tx.post.update.mockClear();

    await expect(service.remove({ userId: USER_A }, COMMENT_ID)).rejects.toBeInstanceOf(
      BizException,
    );
    await expect(service.remove({ userId: USER_A }, COMMENT_ID)).rejects.toMatchObject({
      code: 'SOCIAL_COMMENT_NOT_FOUND',
      httpStatus: 404,
    });
    expect(tx.post.update).not.toHaveBeenCalled();
  });
});

describe('CommentsService list', () => {
  it('父评论已删时 replyToName 为 null，且不报错', async () => {
    const { service, prisma, posts } = createService();
    const reply = commentRow({
      id: 'reply-id-xxxxx',
      userId: USER_B,
      body: 're',
      parentId: PARENT_ID,
    });
    prisma.client.comment.findMany.mockResolvedValueOnce([reply]).mockResolvedValueOnce([]);
    posts.resolveAuthors.mockResolvedValue(new Map([[USER_B, author(USER_B, 'Bob')]]));

    const result = await service.list({ userId: USER_A }, POST_ID, { limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.replyToName).toBeNull();
    expect(result.items[0]?.parentId).toBe(PARENT_ID);
    expect(result.nextCursor).toBeNull();
  });

  it('带 parentId 的评论渲染父评作者昵称', async () => {
    const { service, prisma, posts } = createService();
    const reply = commentRow({
      id: 'reply-id-xxxxx',
      userId: USER_B,
      body: 're',
      parentId: PARENT_ID,
    });
    prisma.client.comment.findMany
      .mockResolvedValueOnce([reply])
      .mockResolvedValueOnce([{ id: PARENT_ID, userId: USER_A }]);
    posts.resolveAuthors.mockResolvedValue(
      new Map([
        [USER_A, author(USER_A, 'Alice')],
        [USER_B, author(USER_B, 'Bob')],
      ]),
    );

    const result = await service.list({ userId: USER_B }, POST_ID, {});

    expect(result.items[0]?.replyToName).toBe('Alice');
    expect(result.items[0]?.isMine).toBe(true);
  });

  it('likedByMe 对当前用户正确，且整页一次查出', async () => {
    const { service, prisma } = createService();
    const mine = commentRow({ id: 'cmt-mine-xxxx', likeCount: 1 });
    const other = commentRow({ id: 'cmt-other-xxx', userId: USER_B, body: 'yo', likeCount: 0 });
    prisma.client.comment.findMany.mockResolvedValueOnce([mine, other]);
    prisma.client.commentReaction.findMany.mockResolvedValue([{ commentId: mine.id }]);

    const result = await service.list({ userId: USER_A }, POST_ID, {});

    expect(prisma.client.commentReaction.findMany).toHaveBeenCalledWith({
      where: { commentId: { in: [mine.id, other.id] }, userId: USER_A },
      select: { commentId: true },
    });
    expect(result.items[0]?.likedByMe).toBe(true);
    expect(result.items[0]?.likeCount).toBe(1);
    expect(result.items[1]?.likedByMe).toBe(false);
  });
});

describe('CommentsService like / unlike', () => {
  it('首次点赞：create 成功才 increment', async () => {
    const { service, prisma, tx } = createService();
    prisma.client.comment.findFirst.mockResolvedValue(commentRow());
    tx.commentReaction.create.mockResolvedValue({});
    tx.comment.update.mockResolvedValue({ likeCount: 1 });
    prisma.client.$transaction.mockImplementation(async (fn: (client: TxMocks) => unknown) =>
      fn(tx),
    );

    const result = await service.like({ userId: USER_A }, COMMENT_ID);

    expect(tx.commentReaction.create).toHaveBeenCalledWith({
      data: { commentId: COMMENT_ID, userId: USER_A },
    });
    expect(tx.comment.update).toHaveBeenCalledWith({
      where: { id: COMMENT_ID },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
    expect(result).toEqual({ commentId: COMMENT_ID, likeCount: 1, likedByMe: true });
  });

  it('P2002 分支不 increment', async () => {
    const { service, prisma, tx } = createService();
    prisma.client.comment.findFirst.mockResolvedValue(commentRow({ likeCount: 1 }));
    tx.commentReaction.create.mockRejectedValue(createP2002());
    prisma.client.$transaction.mockImplementation(async (fn: (client: TxMocks) => unknown) =>
      fn(tx),
    );
    prisma.client.comment.findUniqueOrThrow.mockResolvedValue({ likeCount: 1 });

    const result = await service.like({ userId: USER_A }, COMMENT_ID);

    expect(tx.comment.update).not.toHaveBeenCalled();
    expect(prisma.client.comment.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: COMMENT_ID },
      select: { likeCount: true },
    });
    expect(result).toEqual({ commentId: COMMENT_ID, likeCount: 1, likedByMe: true });
  });

  it('取消赞：deleteMany count=0 时不 decrement', async () => {
    const { service, prisma, tx } = createService();
    prisma.client.comment.findFirst.mockResolvedValue(commentRow());
    tx.commentReaction.deleteMany.mockResolvedValue({ count: 0 });
    tx.comment.findUniqueOrThrow.mockResolvedValue({ likeCount: 0 });
    prisma.client.$transaction.mockImplementation(async (fn: (client: TxMocks) => unknown) =>
      fn(tx),
    );

    const result = await service.unlike({ userId: USER_A }, COMMENT_ID);

    expect(tx.comment.update).not.toHaveBeenCalled();
    expect(result).toEqual({ commentId: COMMENT_ID, likeCount: 0, likedByMe: false });
  });

  it('取消赞：真正删掉记录才 decrement', async () => {
    const { service, prisma, tx } = createService();
    prisma.client.comment.findFirst.mockResolvedValue(commentRow({ likeCount: 1 }));
    tx.commentReaction.deleteMany.mockResolvedValue({ count: 1 });
    tx.comment.update.mockResolvedValue({ likeCount: 0 });
    prisma.client.$transaction.mockImplementation(async (fn: (client: TxMocks) => unknown) =>
      fn(tx),
    );

    const result = await service.unlike({ userId: USER_A }, COMMENT_ID);

    expect(tx.comment.update).toHaveBeenCalledWith({
      where: { id: COMMENT_ID },
      data: { likeCount: { decrement: 1 } },
      select: { likeCount: true },
    });
    expect(result).toEqual({ commentId: COMMENT_ID, likeCount: 0, likedByMe: false });
  });

  it('已删评论返回 SOCIAL_COMMENT_NOT_FOUND', async () => {
    const { service, prisma } = createService();
    prisma.client.comment.findFirst.mockResolvedValue(null);

    await expect(service.like({ userId: USER_A }, COMMENT_ID)).rejects.toMatchObject({
      code: 'SOCIAL_COMMENT_NOT_FOUND',
      httpStatus: 404,
    });
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });
});
