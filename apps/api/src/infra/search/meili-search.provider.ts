import type { PostSearchDoc, SearchPage, SearchProvider, UserSearchDoc } from './search-provider';

const WAIT_OPTIONS = { timeout: 60_000 };

/** meilisearch@0.60 为纯 ESM，API 包是 CJS；只做动态 import，避免 TS1479。 */
type EnqueuedTaskPromise = Promise<{ taskUid: number }> & {
  waitTask: (opts?: { timeout?: number }) => Promise<{
    uid: number;
    status: string;
    error?: { message?: string; code?: string } | null;
  }>;
};

type MeiliIndex<T> = {
  addDocuments: (docs: T[]) => EnqueuedTaskPromise;
  deleteDocument: (id: string) => EnqueuedTaskPromise;
  deleteAllDocuments: () => EnqueuedTaskPromise;
  updateSettings: (settings: Record<string, unknown>) => EnqueuedTaskPromise;
  search: (
    q: string,
    opts: { offset: number; limit: number; attributesToRetrieve: string[] },
  ) => Promise<{ hits: Array<{ id?: unknown }>; estimatedTotalHits?: number }>;
};

type MeilisearchClient = {
  index: <T>(uid: string) => MeiliIndex<T>;
  getIndex: (uid: string) => Promise<MeiliIndex<Record<string, unknown>>>;
  createIndex: (uid: string, options?: { primaryKey: string }) => EnqueuedTaskPromise;
};

type MeilisearchCtor = new (cfg: { host: string; apiKey: string }) => MeilisearchClient;

export class MeiliSearchProvider implements SearchProvider {
  readonly name = 'meili' as const;

  private client: MeilisearchClient | null = null;

  constructor(
    private readonly host: string,
    private readonly apiKey: string,
    private readonly prefix: string,
  ) {}

  private get postsUid(): string {
    return `${this.prefix}_posts`;
  }

  private get usersUid(): string {
    return `${this.prefix}_users`;
  }

  async init(): Promise<void> {
    const posts = await this.ensureIndex(this.postsUid);
    const users = await this.ensureIndex(this.usersUid);
    await waitTask(
      posts.updateSettings({
        searchableAttributes: ['body'],
        filterableAttributes: ['userId'],
        sortableAttributes: ['createdAtTs'],
      }),
    );
    await waitTask(
      users.updateSettings({
        searchableAttributes: ['displayName'],
      }),
    );
  }

  async indexPost(doc: PostSearchDoc): Promise<void> {
    await waitTask((await this.postsIndex()).addDocuments([doc]));
  }

  async deletePost(postId: string): Promise<void> {
    await waitTask((await this.postsIndex()).deleteDocument(postId));
  }

  async indexUser(doc: UserSearchDoc): Promise<void> {
    await waitTask((await this.usersIndex()).addDocuments([doc]));
  }

  async searchPosts(q: string, page: { offset: number; limit: number }): Promise<SearchPage> {
    const result = await (
      await this.postsIndex()
    ).search(q, {
      offset: page.offset,
      limit: page.limit,
      attributesToRetrieve: ['id'],
    });
    return mapSearchPage(result.hits, result);
  }

  async searchUsers(q: string, page: { offset: number; limit: number }): Promise<SearchPage> {
    const result = await (
      await this.usersIndex()
    ).search(q, {
      offset: page.offset,
      limit: page.limit,
      attributesToRetrieve: ['id'],
    });
    return mapSearchPage(result.hits, result);
  }

  async clearAll(): Promise<void> {
    await waitTask((await this.postsIndex()).deleteAllDocuments());
    await waitTask((await this.usersIndex()).deleteAllDocuments());
  }

  private async getClient(): Promise<MeilisearchClient> {
    if (this.client) return this.client;
    const mod = (await import('meilisearch')) as { Meilisearch: MeilisearchCtor };
    this.client = new mod.Meilisearch({ host: this.host, apiKey: this.apiKey });
    return this.client;
  }

  private async postsIndex(): Promise<MeiliIndex<PostSearchDoc>> {
    return (await this.getClient()).index<PostSearchDoc>(this.postsUid);
  }

  private async usersIndex(): Promise<MeiliIndex<UserSearchDoc>> {
    return (await this.getClient()).index<UserSearchDoc>(this.usersUid);
  }

  private async ensureIndex(uid: string): Promise<MeiliIndex<Record<string, unknown>>> {
    const client = await this.getClient();
    try {
      await client.getIndex(uid);
      return client.index(uid);
    } catch (err) {
      if (!isMeiliCode(err, 'index_not_found')) throw err;
    }
    try {
      await waitTask(client.createIndex(uid, { primaryKey: 'id' }));
    } catch (err) {
      if (!isIndexAlreadyExists(err)) throw err;
    }
    return client.index(uid);
  }
}

async function waitTask(task: EnqueuedTaskPromise): Promise<void> {
  const result = await task.waitTask(WAIT_OPTIONS);
  if (result.status === 'failed' || result.status === 'canceled') {
    const detail = result.error?.message ?? result.status;
    const err = new Error(`Meilisearch 任务 ${result.uid} ${result.status}: ${detail}`) as Error & {
      code?: string;
      cause?: { code?: string; message?: string };
    };
    err.code = result.error?.code;
    err.cause = result.error ?? undefined;
    throw err;
  }
}

function mapSearchPage(
  hits: Array<{ id?: unknown }>,
  result: { estimatedTotalHits?: number },
): SearchPage {
  const ids = hits.map((hit) => String(hit.id));
  return {
    ids,
    estimatedTotal: result.estimatedTotalHits ?? ids.length,
  };
}

function isMeiliCode(err: unknown, code: string): boolean {
  if (typeof err !== 'object' || err == null) return false;
  const rec = err as { code?: unknown; cause?: { code?: unknown } };
  return rec.code === code || rec.cause?.code === code;
}

function isIndexAlreadyExists(err: unknown): boolean {
  if (isMeiliCode(err, 'index_already_exists')) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /already exists/i.test(message);
}
