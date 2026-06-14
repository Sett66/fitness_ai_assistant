import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { AgentMemoryFact, AgentMemoryPatch } from '@fitness/shared';
import { LLM_MODELS, MEMORY_EXTRACT_DAILY_LIMIT } from '@fitness/shared';
import type { Queue } from 'bullmq';
import type { Prisma } from '@fitness/db';

import { PrismaService } from '../infra/prisma/prisma.service';
import {
  AI_TASK_QUEUE_NAME,
  MEMORY_EXTRACT_JOB_NAME,
  type AiTaskJobPayload,
} from '../infra/queue/queue.constants';

const MIN_CONFIDENCE = 0.6;

export type MemoryExtractInput = {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  latestUserText: string;
  assistantReply: string;
};

@Injectable()
export class AgentMemoryService {
  private readonly logger = new Logger(AgentMemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(AI_TASK_QUEUE_NAME) private readonly queue: Queue<AiTaskJobPayload>,
  ) {}

  async listForPrompt(userId: string, limit = 20): Promise<AgentMemoryFact[]> {
    const rows = await this.prisma.client.userAgentMemory.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: { key: true, value: true, confidence: true },
    });

    return rows.map((row) => ({
      key: row.key,
      value: row.value,
      confidence: row.confidence,
    }));
  }

  async applyPatches(
    userId: string,
    patches: AgentMemoryPatch[],
    sourceMessageId?: string,
  ): Promise<{ upserted: number; removed: number }> {
    let upserted = 0;
    let removed = 0;

    for (const patch of patches) {
      const confidence = patch.confidence ?? 0.8;
      if (confidence < MIN_CONFIDENCE) {
        continue;
      }

      if (patch.action === 'remove') {
        const result = await this.prisma.client.userAgentMemory.deleteMany({
          where: { userId, key: patch.key },
        });
        if (result.count > 0) {
          removed += result.count;
        }
        continue;
      }

      const value = patch.value!.trim();
      await this.prisma.client.userAgentMemory.upsert({
        where: { userId_key: { userId, key: patch.key } },
        create: {
          userId,
          key: patch.key,
          value,
          confidence,
          sourceMessageId: sourceMessageId ?? null,
        },
        update: {
          value,
          confidence,
          sourceMessageId: sourceMessageId ?? null,
        },
      });
      upserted += 1;
    }

    return { upserted, removed };
  }

  /** COACH_CHAT 成功后异步入队；超限或失败不影响当轮 SSE */
  async enqueueMemoryExtract(userId: string, input: MemoryExtractInput): Promise<void> {
    if (!(await this.canExtractToday(userId))) {
      this.logger.debug(`用户 ${userId} 今日记忆抽取已达上限，跳过`);
      return;
    }

    const run = await this.prisma.client.aiRun.create({
      data: {
        userId,
        taskType: 'MEMORY_EXTRACT',
        model: LLM_MODELS.DEEPSEEK_V4_PRO,
        status: 'QUEUED',
        conversationId: input.conversationId,
        triggerMessageId: input.userMessageId,
        inputJson: {
          conversationId: input.conversationId,
          userMessageId: input.userMessageId,
          assistantMessageId: input.assistantMessageId,
          latestUserText: input.latestUserText,
          assistantReply: input.assistantReply,
        } as Prisma.InputJsonValue,
      },
    });

    await this.queue.add(
      MEMORY_EXTRACT_JOB_NAME,
      { aiRunId: run.id },
      {
        priority: 10,
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
  }

  private async canExtractToday(userId: string): Promise<boolean> {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const count = await this.prisma.client.aiRun.count({
      where: { userId, taskType: 'MEMORY_EXTRACT', createdAt: { gte: start } },
    });
    return count < MEMORY_EXTRACT_DAILY_LIMIT;
  }
}
