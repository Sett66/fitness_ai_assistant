import 'reflect-metadata';
import { bootstrapApiEnv } from '../bootstrap-api-env';
bootstrapApiEnv();
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { createMemoryEmbedding } from '@fitness/ai-core';
import { envValidationSchema } from '../config/env.schema';
import { PrismaModule } from '../infra/prisma/prisma.module';
import { PrismaService } from '../infra/prisma/prisma.service';
import { MemorySearchProvider } from '../infra/search/memory-search.provider';
import { SearchModule } from '../infra/search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envValidationSchema }),
    PrismaModule,
    SearchModule,
  ],
})
class ReindexMemoriesModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(ReindexMemoriesModule);
  const prisma = app.get(PrismaService);
  const search = app.get(MemorySearchProvider);
  const logger = new Logger('reindex-memories');
  try {
    await search.init();
    const rows = await prisma.client.userAgentMemory.findMany({ where: { deletedAt: null } });
    for (const row of rows) {
      await search.index({
        id: row.id,
        userId: row.userId,
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
    logger.log(`已索引记忆 ${rows.length}`);
  } finally {
    await app.close();
  }
}
void main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
