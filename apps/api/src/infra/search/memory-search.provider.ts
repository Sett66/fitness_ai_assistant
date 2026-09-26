import { createMemoryEmbedding } from '@fitness/ai-core';
import type { MemoryCategory } from '@fitness/shared';

export const MEMORY_HYBRID_SEMANTIC_RATIO = 0.5;

export type MemoryIndexDoc = {
  id: string;
  userId: string;
  key: string;
  category: MemoryCategory;
  value: string;
  _vectors: { memory: number[] };
};
export type MemoryHit = Pick<MemoryIndexDoc, 'id' | 'key' | 'category' | 'value'>;

type Task = Promise<{ taskUid: number }> & { waitTask: () => Promise<{ status: string }> };
type Index = {
  addDocuments: (docs: MemoryIndexDoc[]) => Task;
  deleteDocument: (id: string) => Task;
  updateSettings: (settings: Record<string, unknown>) => Task;
  search: (q: string, opts: Record<string, unknown>) => Promise<{ hits: MemoryHit[] }>;
};
type Client = {
  index: (uid: string) => Index;
  getIndex: (uid: string) => Promise<Index>;
  createIndex: (uid: string, options: { primaryKey: string }) => Task;
};

/** Deliberately separate from public social search: tenant filtering cannot be bypassed by callers. */
export class MemorySearchProvider {
  private client: Client | null = null;
  constructor(
    private readonly host: string,
    private readonly apiKey: string,
    private readonly prefix: string,
  ) {}
  private get uid() {
    return `${this.prefix}_memories`;
  }

  async init(): Promise<void> {
    const index = await this.getIndex();
    await this.wait(
      index.updateSettings({
        searchableAttributes: ['value', 'key'],
        filterableAttributes: ['userId', 'category'],
        embedders: { memory: { source: 'userProvided', dimensions: 1024 } },
      }),
    );
  }
  async index(doc: MemoryIndexDoc): Promise<void> {
    await this.wait((await this.getIndex()).addDocuments([doc]));
  }
  async remove(memoryId: string): Promise<void> {
    await this.wait((await this.getIndex()).deleteDocument(memoryId));
  }
  async search(
    userId: string,
    query: string,
    options?: { category?: MemoryCategory; limit?: number; semanticRatio?: number },
  ): Promise<MemoryHit[]> {
    const vector = await createMemoryEmbedding(query);
    const categoryFilter = options?.category ? ` AND category = "${options.category}"` : '';
    const semanticRatio = options?.semanticRatio ?? MEMORY_HYBRID_SEMANTIC_RATIO;
    const result = await (
      await this.getIndex()
    ).search(query, {
      limit: Math.min(options?.limit ?? 5, 5),
      filter: `userId = "${userId.replace(/"/g, '\\"')}"${categoryFilter}`,
      attributesToRetrieve: ['id', 'key', 'category', 'value'],
      hybrid: { embedder: 'memory', semanticRatio },
      vector,
    });
    return result.hits;
  }
  private async getIndex(): Promise<Index> {
    const client = await this.getClient();
    try {
      await client.getIndex(this.uid);
    } catch (error: unknown) {
      if (!isIndexMissing(error)) throw error;
      await this.wait(client.createIndex(this.uid, { primaryKey: 'id' }));
    }
    return client.index(this.uid);
  }
  private async getClient(): Promise<Client> {
    if (this.client) return this.client;
    const mod = (await import('meilisearch')) as unknown as {
      Meilisearch: new (c: { host: string; apiKey: string }) => Client;
    };
    this.client = new mod.Meilisearch({ host: this.host, apiKey: this.apiKey });
    return this.client;
  }
  private async wait(task: Task) {
    const status = await task.waitTask();
    if (status.status === 'failed' || status.status === 'canceled')
      throw new Error(`Meili task ${status.status}`);
  }
}

function isIndexMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; cause?: { code?: unknown } };
  return record.code === 'index_not_found' || record.cause?.code === 'index_not_found';
}
