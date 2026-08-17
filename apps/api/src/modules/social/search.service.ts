import { Inject, Injectable } from '@nestjs/common';
import type { SocialSearchResponse } from '@fitness/shared';
import { SocialSearchQuerySchema, errorMessagesZhCN } from '@fitness/shared';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { SEARCH_PROVIDER, type SearchProvider } from '../../infra/search/search-provider';
import { PostsService } from './posts.service';
import { SocialUsersService } from './social-users.service';

@Injectable()
export class SearchService {
  constructor(
    @Inject(SEARCH_PROVIDER) private readonly provider: SearchProvider,
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly socialUsers: SocialUsersService,
  ) {}

  async search(user: JwtUserPayload, query: unknown): Promise<SocialSearchResponse> {
    const input = parseWith(SocialSearchQuerySchema, query);
    const offset = parseSearchOffset(input.cursor);
    const limit = input.limit ?? 20;

    if (input.type === 'USER') {
      const { ids, nextCursor } = await this.searchIds(
        () => this.provider.searchUsers(input.q, { offset, limit }),
        offset,
        limit,
      );
      const items = await this.socialUsers.hydrateProfiles(ids);
      return { type: 'USER', users: { items, nextCursor } };
    }

    const { ids, nextCursor } = await this.searchIds(
      () => this.provider.searchPosts(input.q, { offset, limit }),
      offset,
      limit,
    );
    const rows = await this.prisma.client.post.findMany({
      where: {
        id: { in: ids },
        deletedAt: null,
        visibility: 'PUBLIC',
        moderation: { not: 'REJECTED' },
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
    const items = await this.posts.mapPosts(ordered, user.userId);
    return { type: 'POST', posts: { items, nextCursor } };
  }

  private async searchIds(
    run: () => Promise<{ ids: string[] }>,
    offset: number,
    limit: number,
  ): Promise<{ ids: string[]; nextCursor: string | null }> {
    let ids: string[];
    try {
      ({ ids } = await run());
    } catch (err) {
      if (err instanceof BizException) throw err;
      throw new BizException(
        'SOCIAL_SEARCH_UNAVAILABLE',
        errorMessagesZhCN.SOCIAL_SEARCH_UNAVAILABLE,
        503,
      );
    }
    return {
      ids,
      nextCursor: ids.length < limit ? null : String(offset + limit),
    };
  }
}

/** 搜索 cursor 编码 offset；非法值视为 0（ADR 0011 §11） */
export function parseSearchOffset(cursor: string | undefined): number {
  if (cursor == null || cursor === '') return 0;
  const n = Number(cursor);
  if (!Number.isInteger(n) || n < 0) return 0;
  return n;
}
