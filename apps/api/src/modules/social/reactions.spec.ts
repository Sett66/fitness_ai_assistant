import type { Post } from '@fitness/db';
import { Prisma } from '@fitness/db';

import { BizException } from '../../common/exceptions/biz-exception';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { S3StorageService } from '../../infra/storage/s3-storage.service';
import { isUniqueViolation } from './is-unique-violation';
import { PostsService } from './posts.service';

const USER_A = 'user-a-xxxxxxxx';
const POST_ID = 'post-id-xxxxxxx';

function visiblePost(overrides: Partial<Post> = {}): Post {
  return {
    id: POST_ID,
    userId: 'author-id-xxxxx',
    body: 'hello',
    mediaIds: [],
    visibility: 'PUBLIC',
    likeCount: 1,
    commentCount: 0,
    moderation: 'APPROVED',
    moderationReason: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createP2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  });
}

type TxMocks = {
  reaction: { create: jest.Mock; deleteMany: jest.Mock };
  post: { update: jest.Mock; findUniqueOrThrow: jest.Mock };
};

function createService() {
  const tx: TxMocks = {
    reaction: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    post: {
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };

  const prisma = {
    client: {
      post: {
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      user: { findMany: jest.fn() },
      reaction: { findMany: jest.fn() },
      $transaction: jest.fn(),
    },
  };

  const indexQueue = { add: jest.fn().mockResolvedValue(undefined) };

  const service = new PostsService(
    prisma as unknown as PrismaService,
    {} as S3StorageService,
    indexQueue as never,
  );

  return { service, prisma, tx, indexQueue };
}

describe('isUniqueViolation', () => {
  it('识别 Prisma P2002', () => {
    expect(isUniqueViolation(createP2002())).toBe(true);
    expect(isUniqueViolation(new Error('nope'))).toBe(false);
    expect(isUniqueViolation({ name: 'PrismaClientKnownRequestError', code: 'P2002' })).toBe(true);
  });
});

describe('PostsService like / unlike', () => {
  it('首次点赞：create 成功才 increment', async () => {
    const { service, prisma, tx } = createService();
    prisma.client.post.findFirst.mockResolvedValue(visiblePost({ likeCount: 0 }));
    tx.reaction.create.mockResolvedValue({});
    tx.post.update.mockResolvedValue({ likeCount: 1 });
    prisma.client.$transaction.mockImplementation(async (fn: (client: TxMocks) => unknown) =>
      fn(tx),
    );

    const result = await service.like({ userId: USER_A }, POST_ID);

    expect(tx.reaction.create).toHaveBeenCalledWith({
      data: { postId: POST_ID, userId: USER_A, kind: 'LIKE' },
    });
    expect(tx.post.update).toHaveBeenCalledWith({
      where: { id: POST_ID },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
    expect(result).toEqual({ postId: POST_ID, likeCount: 1, likedByMe: true });
  });

  it('P2002 分支不 increment', async () => {
    const { service, prisma, tx } = createService();
    prisma.client.post.findFirst.mockResolvedValue(visiblePost({ likeCount: 1 }));
    tx.reaction.create.mockRejectedValue(createP2002());
    prisma.client.$transaction.mockImplementation(async (fn: (client: TxMocks) => unknown) =>
      fn(tx),
    );
    prisma.client.post.findUniqueOrThrow.mockResolvedValue({ likeCount: 1 });

    const result = await service.like({ userId: USER_A }, POST_ID);

    expect(tx.post.update).not.toHaveBeenCalled();
    expect(prisma.client.post.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: POST_ID },
      select: { likeCount: true },
    });
    expect(result).toEqual({ postId: POST_ID, likeCount: 1, likedByMe: true });
  });

  it('取消赞：deleteMany count=0 时不 decrement', async () => {
    const { service, prisma, tx } = createService();
    prisma.client.post.findFirst.mockResolvedValue(visiblePost({ likeCount: 0 }));
    tx.reaction.deleteMany.mockResolvedValue({ count: 0 });
    tx.post.findUniqueOrThrow.mockResolvedValue({ likeCount: 0 });
    prisma.client.$transaction.mockImplementation(async (fn: (client: TxMocks) => unknown) =>
      fn(tx),
    );

    const result = await service.unlike({ userId: USER_A }, POST_ID);

    expect(tx.post.update).not.toHaveBeenCalled();
    expect(result).toEqual({ postId: POST_ID, likeCount: 0, likedByMe: false });
  });

  it('取消赞：真正删掉记录才 decrement', async () => {
    const { service, prisma, tx } = createService();
    prisma.client.post.findFirst.mockResolvedValue(visiblePost({ likeCount: 1 }));
    tx.reaction.deleteMany.mockResolvedValue({ count: 1 });
    tx.post.update.mockResolvedValue({ likeCount: 0 });
    prisma.client.$transaction.mockImplementation(async (fn: (client: TxMocks) => unknown) =>
      fn(tx),
    );

    const result = await service.unlike({ userId: USER_A }, POST_ID);

    expect(tx.post.update).toHaveBeenCalledWith({
      where: { id: POST_ID },
      data: { likeCount: { decrement: 1 } },
      select: { likeCount: true },
    });
    expect(result).toEqual({ postId: POST_ID, likeCount: 0, likedByMe: false });
  });

  it('不可见帖子返回 SOCIAL_POST_NOT_FOUND', async () => {
    const { service, prisma } = createService();
    prisma.client.post.findFirst.mockResolvedValue(null);

    await expect(service.like({ userId: USER_A }, POST_ID)).rejects.toBeInstanceOf(BizException);
    await expect(service.like({ userId: USER_A }, POST_ID)).rejects.toMatchObject({
      code: 'SOCIAL_POST_NOT_FOUND',
      httpStatus: 404,
    });
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });
});

describe('PostsService 索引入队', () => {
  it('发帖成功后入队 INDEX_POST', async () => {
    const { service, prisma, indexQueue } = createService();
    const post = visiblePost({ userId: USER_A, body: '今天深蹲' });
    prisma.client.post.create.mockResolvedValue(post);
    prisma.client.user.findMany.mockResolvedValue([
      { id: USER_A, displayName: 'Alice', avatarMedia: null },
    ]);
    prisma.client.reaction.findMany.mockResolvedValue([]);

    await service.create({ userId: USER_A }, { body: '今天深蹲' });

    expect(indexQueue.add).toHaveBeenCalledWith(
      'default',
      { op: 'INDEX_POST', id: POST_ID },
      expect.objectContaining({ attempts: 8 }),
    );
  });

  it('软删成功后入队 DELETE_POST', async () => {
    const { service, prisma, indexQueue } = createService();
    prisma.client.post.updateMany.mockResolvedValue({ count: 1 });

    await service.softDelete({ userId: USER_A }, POST_ID);

    expect(indexQueue.add).toHaveBeenCalledWith(
      'default',
      { op: 'DELETE_POST', id: POST_ID },
      expect.objectContaining({ attempts: 8 }),
    );
  });

  it('点赞不入队索引任务', async () => {
    const { service, prisma, tx, indexQueue } = createService();
    prisma.client.post.findFirst.mockResolvedValue(visiblePost({ likeCount: 0 }));
    tx.reaction.create.mockResolvedValue({});
    tx.post.update.mockResolvedValue({ likeCount: 1 });
    prisma.client.$transaction.mockImplementation(async (fn: (client: TxMocks) => unknown) =>
      fn(tx),
    );

    await service.like({ userId: USER_A }, POST_ID);

    expect(indexQueue.add).not.toHaveBeenCalled();
  });
});
