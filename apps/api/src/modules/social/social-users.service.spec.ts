import type { Post } from '@fitness/db';
import type { PostSummary } from '@fitness/shared';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { S3StorageService } from '../../infra/storage/s3-storage.service';
import { PostsService } from './posts.service';
import { SocialUsersService } from './social-users.service';

const USER_A = 'user-a-xxxxxxxx';
const USER_B = 'user-b-xxxxxxxx';
const POST_A = 'post-a-xxxxxxxx';
const POST_PRIVATE = 'post-private-xx';

function postRow(id: string, overrides: Partial<Post> = {}): Post {
  return {
    id,
    userId: USER_A,
    body: 'hello',
    mediaIds: [],
    visibility: 'PUBLIC',
    likeCount: 0,
    commentCount: 0,
    moderation: 'APPROVED',
    moderationReason: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function summary(id: string): PostSummary {
  return {
    id,
    author: { id: USER_A, displayName: 'Alice', avatarUrl: null },
    body: 'hello',
    imageUrls: [],
    visibility: 'PUBLIC',
    moderation: 'APPROVED',
    moderationReason: null,
    likeCount: 0,
    commentCount: 0,
    likedByMe: false,
    isMine: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function createService() {
  const prisma = {
    client: {
      user: { findMany: jest.fn(), findFirst: jest.fn() },
      post: { groupBy: jest.fn(), findMany: jest.fn() },
    },
  };
  const storage = { presignGet: jest.fn().mockResolvedValue('https://cdn.example/a.jpg') };
  const posts = { mapPosts: jest.fn() };

  const service = new SocialUsersService(
    prisma as unknown as PrismaService,
    storage as unknown as S3StorageService,
    posts as unknown as PostsService,
  );

  return { service, prisma, storage, posts };
}

describe('SocialUsersService', () => {
  it('公开档案不含 phone，空昵称走 fallback', async () => {
    const { service, prisma } = createService();
    prisma.client.user.findMany.mockResolvedValue([
      {
        id: USER_A,
        displayName: null,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        avatarMedia: null,
      },
    ]);
    prisma.client.post.groupBy.mockResolvedValue([{ userId: USER_A, _count: { _all: 2 } }]);

    const profile = await service.getProfile(USER_A);

    expect(profile.displayName).toBe(`健身用户${USER_A.slice(-4)}`);
    expect(profile.postCount).toBe(2);
    expect(profile.avatarUrl).toBeNull();
    expect(profile).not.toHaveProperty('phone');
    expect(JSON.stringify(profile)).not.toContain('phone');
  });

  it('用户不存在或已软删返回 USER_NOT_FOUND', async () => {
    const { service, prisma } = createService();
    prisma.client.user.findMany.mockResolvedValue([]);
    prisma.client.post.groupBy.mockResolvedValue([]);

    await expect(service.getProfile(USER_A)).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      httpStatus: 404,
    });
  });

  it('看自己的帖子列表不限制 visibility / moderation', async () => {
    const { service, prisma, posts } = createService();
    prisma.client.user.findFirst.mockResolvedValue({ id: USER_A });
    prisma.client.post.findMany.mockResolvedValue([
      postRow(POST_PRIVATE, { visibility: 'PRIVATE' }),
      postRow(POST_A),
    ]);
    posts.mapPosts.mockImplementation(async (rows: Post[]) => rows.map((row) => summary(row.id)));

    const result = await service.listPosts({ userId: USER_A }, USER_A, { limit: 20 });

    expect(prisma.client.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_A, deletedAt: null },
      }),
    );
    expect(result.items.map((item) => item.id)).toEqual([POST_PRIVATE, POST_A]);
  });

  it('看他人只能看到公开且未被拒的帖子', async () => {
    const { service, prisma, posts } = createService();
    prisma.client.user.findFirst.mockResolvedValue({ id: USER_A });
    prisma.client.post.findMany.mockResolvedValue([postRow(POST_A)]);
    posts.mapPosts.mockResolvedValue([summary(POST_A)]);

    await service.listPosts({ userId: USER_B }, USER_A, {});

    expect(prisma.client.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: USER_A,
          deletedAt: null,
          visibility: 'PUBLIC',
          moderation: { not: 'REJECTED' },
        },
      }),
    );
  });

  it('他人主页对不存在用户返回 404', async () => {
    const { service, prisma } = createService();
    prisma.client.user.findFirst.mockResolvedValue(null);

    await expect(service.listPosts({ userId: USER_B }, USER_A, {})).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      httpStatus: 404,
    });
    expect(prisma.client.post.findMany).not.toHaveBeenCalled();
  });

  it('hydrateProfiles 按传入 ids 顺序返回并丢弃已删用户', async () => {
    const { service, prisma, storage } = createService();
    prisma.client.user.findMany.mockResolvedValue([
      {
        id: USER_B,
        displayName: '小李',
        createdAt: new Date('2026-02-01T00:00:00.000Z'),
        avatarMedia: { objectKey: 'avatar/b' },
      },
    ]);
    prisma.client.post.groupBy.mockResolvedValue([{ userId: USER_B, _count: { _all: 3 } }]);

    const items = await service.hydrateProfiles([USER_A, USER_B]);

    expect(storage.presignGet).toHaveBeenCalled();
    expect(items.map((item) => item.id)).toEqual([USER_B]);
    expect(items[0]?.postCount).toBe(3);
    expect(items[0]?.avatarUrl).toBe('https://cdn.example/a.jpg');
  });
});
