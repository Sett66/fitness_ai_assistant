import type { Post } from '@fitness/db';
import type { PostSummary, SocialUserProfile } from '@fitness/shared';

import { BizException } from '../../common/exceptions/biz-exception';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { SearchProvider } from '../../infra/search/search-provider';
import { PostsService } from './posts.service';
import { parseSearchOffset, SearchService } from './search.service';
import { SocialUsersService } from './social-users.service';

const USER_A = 'user-a-xxxxxxxx';
const POST_A = 'post-a-xxxxxxxx';
const POST_B = 'post-b-xxxxxxxx';
const POST_C = 'post-c-xxxxxxxx';

function postRow(id: string, overrides: Partial<Post> = {}): Post {
  return {
    id,
    userId: USER_A,
    body: '今天深蹲 100kg',
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
    body: '今天深蹲 100kg',
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

function profile(id: string, displayName: string): SocialUserProfile {
  return {
    id,
    displayName,
    avatarUrl: null,
    postCount: 1,
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function createService() {
  const provider: Pick<SearchProvider, 'searchPosts' | 'searchUsers'> = {
    searchPosts: jest.fn(),
    searchUsers: jest.fn(),
  };
  const prisma = {
    client: {
      post: { findMany: jest.fn() },
    },
  };
  const posts = { mapPosts: jest.fn() };
  const socialUsers = { hydrateProfiles: jest.fn() };

  const service = new SearchService(
    provider as SearchProvider,
    prisma as unknown as PrismaService,
    posts as unknown as PostsService,
    socialUsers as unknown as SocialUsersService,
  );

  return { service, provider, prisma, posts, socialUsers };
}

describe('parseSearchOffset', () => {
  it('缺省与非法 cursor 视为 0', () => {
    expect(parseSearchOffset(undefined)).toBe(0);
    expect(parseSearchOffset('')).toBe(0);
    expect(parseSearchOffset('abc')).toBe(0);
    expect(parseSearchOffset('-1')).toBe(0);
    expect(parseSearchOffset('1.5')).toBe(0);
  });

  it('合法整数 offset 原样返回', () => {
    expect(parseSearchOffset('0')).toBe(0);
    expect(parseSearchOffset('20')).toBe(20);
  });
});

describe('SearchService', () => {
  it('搜帖子按检索 ids 顺序重排，被过滤的 id 静默丢弃不补位', async () => {
    const { service, provider, prisma, posts } = createService();
    (provider.searchPosts as jest.Mock).mockResolvedValue({
      ids: [POST_A, POST_B, POST_C],
      estimatedTotal: 3,
    });
    prisma.client.post.findMany.mockResolvedValue([postRow(POST_C), postRow(POST_A)]);
    posts.mapPosts.mockImplementation(async (rows: Post[]) => rows.map((row) => summary(row.id)));

    const result = await service.search({ userId: USER_A }, { q: '深蹲', type: 'POST', limit: 20 });

    expect(provider.searchPosts).toHaveBeenCalledWith('深蹲', { offset: 0, limit: 20 });
    expect(result.type).toBe('POST');
    expect(result.posts?.items.map((item) => item.id)).toEqual([POST_A, POST_C]);
    expect(result.posts?.nextCursor).toBeNull();
    expect(JSON.stringify(result)).not.toContain('phone');
  });

  it('满页时 nextCursor 为 offset+limit，与回库过滤无关', async () => {
    const { service, provider, prisma, posts } = createService();
    (provider.searchPosts as jest.Mock).mockResolvedValue({
      ids: [POST_A, POST_B],
      estimatedTotal: 10,
    });
    prisma.client.post.findMany.mockResolvedValue([postRow(POST_A)]);
    posts.mapPosts.mockResolvedValue([summary(POST_A)]);

    const result = await service.search(
      { userId: USER_A },
      { q: '深蹲', type: 'POST', cursor: '20', limit: 2 },
    );

    expect(provider.searchPosts).toHaveBeenCalledWith('深蹲', { offset: 20, limit: 2 });
    expect(result.posts?.nextCursor).toBe('22');
    expect(result.posts?.items).toHaveLength(1);
  });

  it('搜用户走 hydrateProfiles，保持 ids 顺序', async () => {
    const { service, provider, socialUsers } = createService();
    (provider.searchUsers as jest.Mock).mockResolvedValue({
      ids: ['user-b-xxxxxxxx', USER_A],
      estimatedTotal: 2,
    });
    socialUsers.hydrateProfiles.mockResolvedValue([
      profile('user-b-xxxxxxxx', '小李'),
      profile(USER_A, 'Alice'),
    ]);

    const result = await service.search({ userId: USER_A }, { q: '李', type: 'USER' });

    expect(provider.searchUsers).toHaveBeenCalledWith('李', { offset: 0, limit: 20 });
    expect(socialUsers.hydrateProfiles).toHaveBeenCalledWith(['user-b-xxxxxxxx', USER_A]);
    expect(result.type).toBe('USER');
    expect(result.users?.items.map((item) => item.id)).toEqual(['user-b-xxxxxxxx', USER_A]);
    expect(JSON.stringify(result)).not.toContain('phone');
  });

  it('provider 抛错转为 SOCIAL_SEARCH_UNAVAILABLE 503，不降级', async () => {
    const { service, provider, prisma } = createService();
    (provider.searchPosts as jest.Mock).mockRejectedValue(new Error('meili down'));

    await expect(service.search({ userId: USER_A }, { q: '深蹲' })).rejects.toMatchObject({
      code: 'SOCIAL_SEARCH_UNAVAILABLE',
      httpStatus: 503,
    });
    expect(prisma.client.post.findMany).not.toHaveBeenCalled();
  });

  it('校验失败保持 VALIDATION_FAILED，不包装成 503', async () => {
    const { service, provider } = createService();

    await expect(service.search({ userId: USER_A }, { q: '' })).rejects.toBeInstanceOf(
      BizException,
    );
    await expect(service.search({ userId: USER_A }, { q: '' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      httpStatus: 400,
    });
    expect(provider.searchPosts).not.toHaveBeenCalled();
  });
});
