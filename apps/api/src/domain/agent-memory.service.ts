import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import {
  MemoryCategorySchema,
  MemoryKeySchema,
  normalizeMemorySlug,
  type AgentMemoryFact,
  type AgentMemoryPatch,
  type MemoryCategory,
} from '@fitness/shared';

import { PrismaService } from '../infra/prisma/prisma.service';
import { BizException } from '../common/exceptions/biz-exception';
import { MemorySearchProvider } from '../infra/search/memory-search.provider';
import {
  AI_TASK_QUEUE_NAME,
  AI_TASK_JOB_NAME,
  type AiTaskJobPayload,
} from '../infra/queue/queue.constants';
import type { Queue } from 'bullmq';
import { LLM_MODELS } from '@fitness/shared';

const MIN_CONFIDENCE = 0.6;

export type MemoryWrite = {
  category: MemoryCategory;
  slug: string;
  value: string;
  confidence?: number;
  sourceMessageId?: string;
  sourceRunId?: string;
  actor?: 'AGENT' | 'USER' | 'SYSTEM';
  strictIndexSync?: boolean;
};

@Injectable()
export class AgentMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memorySearch: MemorySearchProvider,
    @InjectQueue(AI_TASK_QUEUE_NAME) private readonly queue: Queue<AiTaskJobPayload>,
  ) {}

  async enqueuePersist(
    userId: string,
    payload:
      | {
          op: 'save';
          category: MemoryCategory;
          slug: string;
          value: string;
          confidence?: number;
          sourceMessageId?: string;
        }
      | { op: 'forget'; key: string; sourceMessageId?: string },
  ) {
    const run = await this.prisma.client.aiRun.create({
      data: {
        userId,
        taskType: 'MEMORY_PERSIST',
        model: LLM_MODELS.DEEPSEEK_V4_PRO,
        status: 'QUEUED',
        triggerMessageId: payload.sourceMessageId ?? null,
        inputJson: payload,
      },
    });
    await this.queue.add(
      AI_TASK_JOB_NAME,
      { aiRunId: run.id },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    return run.id;
  }

  async listForPrompt(userId: string, limit = 20): Promise<AgentMemoryFact[]> {
    const rows = await this.prisma.client.userAgentMemory.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: { key: true, category: true, value: true, confidence: true },
    });
    return rows.map((row) => ({ ...row, category: row.category as MemoryCategory }));
  }

  async isSuppressed(userId: string, key: string): Promise<boolean> {
    const memory = await this.prisma.client.userAgentMemory.findUnique({
      where: { userId_key: { userId, key } },
      select: { deletedAt: true, events: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const event = memory?.events[0];
    return Boolean(memory?.deletedAt && event?.actor === 'USER' && event.action === 'DELETE');
  }

  async save(userId: string, input: MemoryWrite) {
    const slug = normalizeMemorySlug(input.slug);
    const category = MemoryCategorySchema.parse(input.category);
    if (!slug) throw new Error('记忆标识不能为空');
    const key = MemoryKeySchema.parse(`${category}:${slug}`);
    const value = input.value.trim();
    if (!value || value.length > 512) throw new Error('记忆内容长度必须为 1–512 字');
    if (/(今天|明天|昨天|这周|本周|刚才|现在|今晚|今早)/.test(value)) {
      throw BizException.validation({ field: 'value', reason: '时效信息不能写入长期记忆' });
    }
    const actor = input.actor ?? 'AGENT';
    if (actor === 'AGENT' && (await this.isSuppressed(userId, key)))
      return { memory: null, suppressed: true };
    const existing = await this.prisma.client.userAgentMemory.findUnique({
      where: { userId_key: { userId, key } },
    });
    const confidence = input.confidence ?? 0.8;
    const action = !existing ? 'CREATE' : existing.deletedAt ? 'RESTORE' : 'UPDATE';
    const memory = existing
      ? await this.prisma.client.userAgentMemory.update({
          where: { id: existing.id },
          data: {
            value,
            confidence,
            sourceMessageId: input.sourceMessageId ?? null,
            deletedAt: null,
            embeddedAt: null,
          },
        })
      : await this.prisma.client.userAgentMemory.create({
          data: {
            userId,
            key,
            category,
            value,
            confidence,
            sourceMessageId: input.sourceMessageId ?? null,
          },
        });
    await this.recordEvent(
      memory.id,
      action,
      value,
      actor,
      input.sourceRunId,
      input.sourceMessageId,
    );
    try {
      const { createMemoryEmbedding } = await import('@fitness/ai-core');
      await this.memorySearch.index({
        id: memory.id,
        userId,
        key,
        category,
        value,
        _vectors: { memory: await createMemoryEmbedding(`${key}\n${value}`) },
      });
      await this.prisma.client.userAgentMemory.update({
        where: { id: memory.id },
        data: { embeddedAt: new Date() },
      });
    } catch (error: unknown) {
      if (input.strictIndexSync) throw error;
      // Postgres is authoritative; reindex can repair a failed derivative write.
    }
    return { memory, suppressed: false };
  }

  async forget(
    userId: string,
    key: string,
    actor: 'AGENT' | 'USER' = 'AGENT',
    sourceRunId?: string,
    strictIndexSync = false,
  ) {
    const parsedKey = MemoryKeySchema.parse(key);
    const memory = await this.prisma.client.userAgentMemory.findUnique({
      where: { userId_key: { userId, key: parsedKey } },
    });
    if (!memory) return null;
    // A previous worker attempt can have committed the soft delete but failed to
    // remove the derived Meili document. Keep retrying that idempotent removal.
    if (memory.deletedAt) {
      if (strictIndexSync) {
        await this.memorySearch.remove(memory.id);
      }
      return memory;
    }
    const deleted = await this.prisma.client.userAgentMemory.update({
      where: { id: memory.id },
      data: { deletedAt: new Date(), embeddedAt: null },
    });
    await this.recordEvent(memory.id, 'DELETE', memory.value, actor, sourceRunId);
    try {
      await this.memorySearch.remove(memory.id);
    } catch (error: unknown) {
      if (strictIndexSync) throw error; /* derived index failure must not resurrect data */
    }
    return deleted;
  }

  async forgetByIdForUser(userId: string, id: string) {
    const memory = await this.prisma.client.userAgentMemory.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!memory) return null;
    const deleted = await this.prisma.client.userAgentMemory.update({
      where: { id },
      data: { deletedAt: new Date(), embeddedAt: null },
    });
    await this.recordEvent(id, 'DELETE', memory.value, 'USER');
    try {
      await this.memorySearch.remove(id);
    } catch {
      /* database deletion remains authoritative */
    }
    return deleted;
  }

  async updateByUser(userId: string, id: string, value: string) {
    if (/(今天|明天|昨天|这周|本周|刚才|现在|今晚|今早)/.test(value.trim())) {
      throw BizException.validation({ field: 'value', reason: '时效信息不能写入长期记忆' });
    }
    const memory = await this.prisma.client.userAgentMemory.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!memory) return null;
    const next = await this.prisma.client.userAgentMemory.update({
      where: { id },
      data: { value: value.trim(), embeddedAt: null },
    });
    await this.recordEvent(id, 'UPDATE', next.value, 'USER');
    try {
      const { createMemoryEmbedding } = await import('@fitness/ai-core');
      await this.memorySearch.index({
        id: next.id,
        userId,
        key: next.key,
        category: next.category as MemoryCategory,
        value: next.value,
        _vectors: { memory: await createMemoryEmbedding(`${next.key}\n${next.value}`) },
      });
      await this.prisma.client.userAgentMemory.update({
        where: { id },
        data: { embeddedAt: new Date() },
      });
    } catch {
      /* source row remains available to reindex */
    }
    return next;
  }

  async listForUser(userId: string) {
    return this.prisma.client.userAgentMemory.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, key: true, category: true, value: true, updatedAt: true },
      orderBy: [{ category: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  async markUsed(memoryIds: string[]): Promise<void> {
    if (memoryIds.length === 0) return;
    await this.prisma.client.userAgentMemory.updateMany({
      where: { id: { in: memoryIds }, deletedAt: null },
      data: { lastUsedAt: new Date(), hitCount: { increment: 1 } },
    });
  }

  async applyPatches(userId: string, patches: AgentMemoryPatch[], sourceMessageId?: string) {
    let upserted = 0;
    let removed = 0;
    for (const patch of patches) {
      if ((patch.confidence ?? 0.8) < MIN_CONFIDENCE) continue;
      const key = this.normalizeLegacyKey(patch.key);
      if (!key) continue;
      if (patch.action === 'remove') {
        if (await this.forget(userId, key)) removed += 1;
      } else {
        const [category, slug] = key.split(':') as [MemoryCategory, string];
        const saved = await this.save(userId, {
          category,
          slug,
          value: patch.value ?? '',
          confidence: patch.confidence,
          sourceMessageId,
        });
        if (saved.memory) upserted += 1;
      }
    }
    return { upserted, removed };
  }

  private normalizeLegacyKey(raw: string): string | null {
    const parsed = MemoryKeySchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    const normalized = normalizeMemorySlug(raw);
    return normalized ? `other:${normalized}` : null;
  }

  private async recordEvent(
    memoryId: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE',
    valueSnapshot: string,
    actor: 'AGENT' | 'USER' | 'SYSTEM',
    sourceRunId?: string,
    sourceMessageId?: string,
  ) {
    await this.prisma.client.userAgentMemoryEvent.create({
      data: {
        memoryId,
        action,
        valueSnapshot,
        actor,
        sourceRunId: sourceRunId ?? null,
        sourceMessageId: sourceMessageId ?? null,
      },
    });
  }
}
