import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { bootstrapApiEnv } from '../bootstrap-api-env';
bootstrapApiEnv();
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { createMemoryEmbedding } from '@fitness/ai-core';
import type { MemoryCategory } from '@fitness/shared';

import { envValidationSchema } from '../config/env.schema';
import { PrismaModule } from '../infra/prisma/prisma.module';
import { PrismaService } from '../infra/prisma/prisma.service';
import { MemorySearchProvider } from '../infra/search/memory-search.provider';
import { SearchModule } from '../infra/search/search.module';

type Sample = {
  id: string;
  kind: 'recall' | 'reject_write';
  userText: string;
  memories: Array<{ key: string; category: MemoryCategory; value: string }>;
  expectedKeys: string[];
};
const EVAL_USER_ID = 'memory-eval-user';
const evalUserId = (sampleId: string) => `${EVAL_USER_ID}-${sampleId}`;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envValidationSchema }),
    PrismaModule,
    SearchModule,
  ],
})
class EvalMemoryModule {}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(EvalMemoryModule);
  const prisma = app.get(PrismaService);
  const search = app.get(MemorySearchProvider);
  const logger = new Logger('eval-memory-recall');
  let evalUserIds: string[] = [];
  try {
    const samples = JSON.parse(
      await readFile(resolve(process.cwd(), '../../docs/issues/memory/golden-set.json'), 'utf8'),
    ) as Sample[];
    await search.init();
    const recalls = samples.filter((sample) => sample.kind === 'recall');
    evalUserIds = recalls.map((sample) => evalUserId(sample.id));
    for (const sample of recalls) {
      const userId = evalUserId(sample.id);
      await prisma.client.user.upsert({
        where: { id: userId },
        create: { id: userId, phone: `memory-eval-${sample.id}`, passwordHash: 'disabled' },
        update: {},
      });
      for (const memory of sample.memories) {
        const row = await prisma.client.userAgentMemory.upsert({
          where: { userId_key: { userId, key: memory.key } },
          create: { userId, ...memory },
          update: { value: memory.value, category: memory.category, deletedAt: null },
        });
        await search.index({
          id: row.id,
          userId,
          key: row.key,
          category: row.category,
          value: row.value,
          _vectors: { memory: await createMemoryEmbedding(`${row.key}\n${row.value}`) },
        });
        await prisma.client.userAgentMemory.update({
          where: { id: row.id },
          data: { embeddedAt: new Date() },
        });
      }
    }
    for (const semanticRatio of [0.3, 0.5, 0.7]) {
      let total = 0;
      let hits = 0;
      let safetyTotal = 0;
      let safetyHits = 0;
      for (const sample of recalls) {
        const found = new Set(
          (
            await search.search(evalUserId(sample.id), sample.userText, { limit: 5, semanticRatio })
          ).map((item) => item.key),
        );
        for (const key of sample.expectedKeys) {
          total += 1;
          if (found.has(key)) hits += 1;
          if (key.startsWith('injury:') || key.startsWith('diet_restriction:')) {
            safetyTotal += 1;
            if (found.has(key)) safetyHits += 1;
          }
        }
      }
      logger.log(
        `semanticRatio=${semanticRatio} P@5=${total ? (hits / total).toFixed(3) : 'n/a'} safety=${safetyTotal ? (safetyHits / safetyTotal).toFixed(3) : 'n/a'}`,
      );
    }
  } finally {
    const rows = await prisma.client.userAgentMemory.findMany({
      where: { userId: { in: evalUserIds }, deletedAt: null },
      select: { id: true },
    });
    await prisma.client.userAgentMemory.updateMany({
      where: { id: { in: rows.map((row) => row.id) } },
      data: { deletedAt: new Date(), embeddedAt: null },
    });
    await Promise.all(rows.map((row) => search.remove(row.id).catch(() => undefined)));
    await app.close();
  }
}
void main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
