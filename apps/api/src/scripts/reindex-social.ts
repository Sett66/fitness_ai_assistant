import 'reflect-metadata';

import { bootstrapApiEnv } from '../bootstrap-api-env';

bootstrapApiEnv();

import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { envValidationSchema } from '../config/env.schema';
import { PrismaModule } from '../infra/prisma/prisma.module';
import { PrismaService } from '../infra/prisma/prisma.service';
import { SEARCH_PROVIDER, type SearchProvider } from '../infra/search/search-provider';
import { SearchModule } from '../infra/search/search.module';
import { fallbackDisplayName } from '../modules/social/social-display-name';

const BATCH_SIZE = 500;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envValidationSchema }),
    PrismaModule,
    SearchModule,
  ],
})
class ReindexSocialModule {}

async function scanPosts(
  prisma: PrismaService,
  search: SearchProvider,
  logger: Logger,
): Promise<number> {
  let count = 0;
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.client.post.findMany({
      where: { deletedAt: null, visibility: 'PUBLIC', moderation: { not: 'REJECTED' } },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (batch.length === 0) break;
    for (const post of batch) {
      await search.indexPost({
        id: post.id,
        userId: post.userId,
        body: post.body,
        createdAtTs: post.createdAt.getTime(),
      });
      count += 1;
    }
    cursor = batch[batch.length - 1]?.id;
    logger.log(`已索引帖子 ${count}`);
    if (batch.length < BATCH_SIZE) break;
  }
  return count;
}

async function scanUsers(
  prisma: PrismaService,
  search: SearchProvider,
  logger: Logger,
): Promise<number> {
  let count = 0;
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.client.user.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, displayName: true },
    });
    if (batch.length === 0) break;
    for (const user of batch) {
      await search.indexUser({
        id: user.id,
        displayName: fallbackDisplayName(user.id, user.displayName),
      });
      count += 1;
    }
    cursor = batch[batch.length - 1]?.id;
    logger.log(`已索引用户 ${count}`);
    if (batch.length < BATCH_SIZE) break;
  }
  return count;
}

async function main(): Promise<void> {
  const logger = new Logger('reindex-social');
  const app = await NestFactory.createApplicationContext(ReindexSocialModule);
  app.enableShutdownHooks();
  const prisma = app.get(PrismaService);
  const search = app.get<SearchProvider>(SEARCH_PROVIDER);
  try {
    await search.init();
    await search.clearAll();
    const posts = await scanPosts(prisma, search, logger);
    const users = await scanUsers(prisma, search, logger);
    logger.log(`重建完成：posts=${posts} users=${users} provider=${search.name}`);
  } finally {
    await app.close();
  }
}

void main()
  .then(() => {
    process.exit(0);
  })
  .catch((err: unknown) => {
    const logger = new Logger('reindex-social');
    if (err instanceof Error) {
      logger.error(err.stack ?? err.message);
    } else {
      logger.error(String(err));
    }
    process.exit(1);
  });
