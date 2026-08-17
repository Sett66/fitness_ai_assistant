import type { PrismaService } from '../prisma/prisma.service';
import type { PostSearchDoc, SearchPage, SearchProvider, UserSearchDoc } from './search-provider';

export class PgSearchProvider implements SearchProvider {
  readonly name = 'pg' as const;

  constructor(private readonly prisma: PrismaService) {}

  async init(): Promise<void> {
    // 数据在 Postgres 内，无需建索引
  }

  async indexPost(_doc: PostSearchDoc): Promise<void> {
    // no-op
  }

  async deletePost(_postId: string): Promise<void> {
    // no-op
  }

  async indexUser(_doc: UserSearchDoc): Promise<void> {
    // no-op
  }

  async searchPosts(q: string, page: { offset: number; limit: number }): Promise<SearchPage> {
    const rows = await this.prisma.client.post.findMany({
      where: {
        deletedAt: null,
        visibility: 'PUBLIC',
        moderation: { not: 'REJECTED' },
        body: { contains: q, mode: 'insensitive' },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: page.offset,
      take: page.limit,
      select: { id: true },
    });
    return toSearchPage(
      rows.map((row) => row.id),
      page,
    );
  }

  async searchUsers(q: string, page: { offset: number; limit: number }): Promise<SearchPage> {
    const rows = await this.prisma.client.user.findMany({
      where: {
        deletedAt: null,
        displayName: { contains: q, mode: 'insensitive' },
      },
      orderBy: { id: 'desc' },
      skip: page.offset,
      take: page.limit,
      select: { id: true },
    });
    return toSearchPage(
      rows.map((row) => row.id),
      page,
    );
  }

  async clearAll(): Promise<void> {
    // no-op
  }
}

function toSearchPage(ids: string[], page: { offset: number; limit: number }): SearchPage {
  return {
    ids,
    estimatedTotal: page.offset + ids.length + (ids.length === page.limit ? 1 : 0),
  };
}
