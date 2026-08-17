import type { Job } from 'bullmq';

import type { PrismaService } from '../infra/prisma/prisma.service';
import type { SearchProvider } from '../infra/search/search-provider';
import { SocialIndexProcessor } from './social-index.processor';

function job(data: { op: 'INDEX_POST' | 'DELETE_POST' | 'INDEX_USER'; id: string }): Job {
  return { data } as Job;
}

function createProcessor() {
  const prisma = {
    client: {
      post: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
    },
  };
  const search: jest.Mocked<Pick<SearchProvider, 'indexPost' | 'deletePost' | 'indexUser'>> = {
    indexPost: jest.fn().mockResolvedValue(undefined),
    deletePost: jest.fn().mockResolvedValue(undefined),
    indexUser: jest.fn().mockResolvedValue(undefined),
  };
  const processor = new SocialIndexProcessor(
    prisma as unknown as PrismaService,
    search as unknown as SearchProvider,
  );
  return { processor, prisma, search };
}

describe('SocialIndexProcessor', () => {
  it('INDEX_POST：公开未删帖写入索引', async () => {
    const { processor, prisma, search } = createProcessor();
    prisma.client.post.findUnique.mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      body: '今天深蹲',
      visibility: 'PUBLIC',
      moderation: 'PENDING',
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await processor.process(job({ op: 'INDEX_POST', id: 'p1' }));

    expect(search.indexPost).toHaveBeenCalledWith({
      id: 'p1',
      userId: 'u1',
      body: '今天深蹲',
      createdAtTs: Date.parse('2026-01-01T00:00:00.000Z'),
    });
    expect(search.deletePost).not.toHaveBeenCalled();
  });

  it('INDEX_POST：PRIVATE / 软删 / REJECTED 改为 deletePost', async () => {
    const { processor, prisma, search } = createProcessor();
    prisma.client.post.findUnique.mockResolvedValue({
      id: 'p1',
      visibility: 'PRIVATE',
      moderation: 'APPROVED',
      deletedAt: null,
    });

    await processor.process(job({ op: 'INDEX_POST', id: 'p1' }));

    expect(search.deletePost).toHaveBeenCalledWith('p1');
    expect(search.indexPost).not.toHaveBeenCalled();
  });

  it('DELETE_POST 直接删索引', async () => {
    const { processor, search } = createProcessor();
    await processor.process(job({ op: 'DELETE_POST', id: 'p1' }));
    expect(search.deletePost).toHaveBeenCalledWith('p1');
  });

  it('INDEX_USER 使用 fallback 昵称，不含 phone', async () => {
    const { processor, prisma, search } = createProcessor();
    prisma.client.user.findUnique.mockResolvedValue({
      id: 'user-id-xxxx1234',
      displayName: null,
      deletedAt: null,
    });

    await processor.process(job({ op: 'INDEX_USER', id: 'user-id-xxxx1234' }));

    expect(search.indexUser).toHaveBeenCalledWith({
      id: 'user-id-xxxx1234',
      displayName: '健身用户1234',
    });
  });
});
