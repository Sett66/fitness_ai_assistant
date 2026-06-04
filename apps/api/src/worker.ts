import 'reflect-metadata';

import { loadApiEnv } from './load-api-env';

loadApiEnv();

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { WorkerRootModule } from './worker.root.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerRootModule);
  const logger = new Logger('WorkerBootstrap');
  logger.log('BullMQ worker 已启动（AI 任务队列）');
  app.enableShutdownHooks();
  await app.init();
}

void bootstrap();
