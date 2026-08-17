import type { PrismaService } from '../../infra/prisma/prisma.service';
import { PgSearchProvider } from './pg-search.provider';

function createPrisma(overrides?: { posts?: { id: string }[]; users?: { id: string }[] }) {
  return {
    client: {
      post: {
        findMany: jest.fn().mockResolvedValue(overrides?.posts ?? [{ id: 'p1' }, { id: 'p2' }]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue(overrides?.users ?? [{ id: 'u1' }]),
      },
    },
  };
}

describe('PgSearchProvider', () => {
  it('写操作为 no-op', async () => {
    const provider = new PgSearchProvider(createPrisma() as unknown as PrismaService);
    await expect(provider.init()).resolves.toBeUndefined();
    await expect(
      provider.indexPost({ id: 'p', userId: 'u', body: 'x', createdAtTs: 1 }),
    ).resolves.toBeUndefined();
    await expect(provider.deletePost('p')).resolves.toBeUndefined();
    await expect(provider.indexUser({ id: 'u', displayName: 'n' })).resolves.toBeUndefined();
    await expect(provider.clearAll()).resolves.toBeUndefined();
  });

  it('searchPosts 只返回 id，满页时 estimatedTotal 多估 1', async () => {
    const prisma = createPrisma({ posts: [{ id: 'a' }, { id: 'b' }] });
    const provider = new PgSearchProvider(prisma as unknown as PrismaService);
    const result = await provider.searchPosts('深蹲', { offset: 0, limit: 2 });
    expect(result.ids).toEqual(['a', 'b']);
    expect(result.estimatedTotal).toBe(3);
    expect(prisma.client.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          visibility: 'PUBLIC',
          body: { contains: '深蹲', mode: 'insensitive' },
        }),
        select: { id: true },
      }),
    );
  });

  it('searchUsers 过滤软删用户', async () => {
    const prisma = createPrisma({ users: [{ id: 'u1' }] });
    const provider = new PgSearchProvider(prisma as unknown as PrismaService);
    const result = await provider.searchUsers('阿', { offset: 0, limit: 20 });
    expect(result.ids).toEqual(['u1']);
    expect(result.estimatedTotal).toBe(1);
    expect(prisma.client.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, displayName: { contains: '阿', mode: 'insensitive' } },
      }),
    );
  });
});
