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
    city: null,
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
      aiRun: { create: jest.fn() },
      $transaction: jest.fn(),
    },
  };

  const indexQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const aiQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue('true') };

  const service = new PostsService(
    prisma as unknown as PrismaService,
    {} as S3StorageService,
    indexQueue as never,
    aiQueue as never,
    config as never,
  );

  return { service, prisma, tx, indexQueue, aiQueue, config };
}

describe('isUniqueViolation', () => {
  it('识别 Prisma P2002', () => {
    expect(isUniqueViolation(createP2002())).toBe(true);
    expect(isUniqueViolation(new Error('nope'))).toBe(false);
    expect(isUniqueViolation({ name: 'PrismaClientKnownRequestError', code: 'P2002' })).toBe(true);
  });
});

describe('PostsService 条件点赞入口', () => {
  it('不可见帖子不进入点赞事务', async () => {
    const { service, prisma } = createService();
    prisma.client.post.findFirst.mockResolvedValue(null);
    await expect(
      service.setLikeState({ userId: USER_A }, POST_ID, true, { expectedRevision: 0 }),
    ).rejects.toMatchObject({ code: 'SOCIAL_POST_NOT_FOUND', httpStatus: 404 });
    await expect(service.getLikeState({ userId: USER_A }, POST_ID)).rejects.toBeInstanceOf(
      BizException,
    );
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });
  it('不允许省略版本绕过条件写入', async () => {
    const { service, prisma } = createService();
    await expect(service.setLikeState({ userId: USER_A }, POST_ID, true, {})).rejects.toMatchObject(
      { code: 'VALIDATION_FAILED' },
    );
    expect(prisma.client.$transaction).not.toHaveBeenCalled();
  });
});
describe('PostsService 索引入队', () => {
  it('发帖成功后入队 INDEX_POST', async () => {
    const { service, prisma, indexQueue, aiQueue } = createService();
    const post = visiblePost({ userId: USER_A, body: '今天深蹲' });
    prisma.client.post.create.mockResolvedValue(post);
    prisma.client.user.findMany.mockResolvedValue([
      { id: USER_A, displayName: 'Alice', avatarMedia: null },
    ]);
    prisma.client.reaction.findMany.mockResolvedValue([]);
    prisma.client.aiRun.create.mockResolvedValue({ id: 'run-1' });

    await service.create({ userId: USER_A }, { body: '今天深蹲' });

    expect(indexQueue.add).toHaveBeenCalledWith(
      'default',
      { op: 'INDEX_POST', id: POST_ID },
      expect.objectContaining({ attempts: 8 }),
    );
    expect(prisma.client.aiRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: USER_A,
        taskType: 'SOCIAL_MODERATE',
        status: 'QUEUED',
        inputJson: { postId: POST_ID },
      }),
    });
    expect(aiQueue.add).toHaveBeenCalledWith(
      'default',
      { aiRunId: 'run-1' },
      expect.objectContaining({ attempts: 3 }),
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
    const { service, prisma, indexQueue } = createService();
    prisma.client.post.findFirst.mockResolvedValue(visiblePost());
    prisma.client.$transaction.mockResolvedValue({
      revision: 1,
      likedByMe: true,
      likeCount: 1,
      applied: true,
    });
    await service.setLikeState({ userId: USER_A }, POST_ID, true, { expectedRevision: 0 });
    expect(indexQueue.add).not.toHaveBeenCalled();
  });
});

describe('PostsService create 审核', () => {
  it('命中拦截词返回 400 且不写库、不回带命中词', async () => {
    const { service, prisma, indexQueue, aiQueue } = createService();

    await expect(
      service.create({ userId: USER_A }, { body: 'buy bannedword now' }),
    ).rejects.toMatchObject({
      code: 'SOCIAL_CONTENT_REJECTED',
      httpStatus: 400,
      message: '内容包含不允许发布的词语，请修改后重试',
    });
    expect(prisma.client.post.create).not.toHaveBeenCalled();
    expect(indexQueue.add).not.toHaveBeenCalled();
    expect(aiQueue.add).not.toHaveBeenCalled();
  });

  it('SOCIAL_MODERATION_ENABLED=false 时直接 APPROVED 且不入审核队列', async () => {
    const { service, prisma, indexQueue, aiQueue, config } = createService();
    config.get.mockReturnValue('false');
    const post = visiblePost({ userId: USER_A, body: '今天深蹲', moderation: 'APPROVED' });
    prisma.client.post.create.mockResolvedValue(post);
    prisma.client.user.findMany.mockResolvedValue([
      { id: USER_A, displayName: 'Alice', avatarMedia: null },
    ]);
    prisma.client.reaction.findMany.mockResolvedValue([]);

    await service.create({ userId: USER_A }, { body: '今天深蹲' });

    expect(prisma.client.post.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ moderation: 'APPROVED' }),
    });
    expect(indexQueue.add).toHaveBeenCalled();
    expect(prisma.client.aiRun.create).not.toHaveBeenCalled();
    expect(aiQueue.add).not.toHaveBeenCalled();
  });
});
