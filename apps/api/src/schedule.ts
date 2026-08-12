import 'reflect-metadata';

import { bootstrapApiEnv } from './bootstrap-api-env';

bootstrapApiEnv();

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { CronRootModule } from './cron.root.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(CronRootModule);
  new Logger('CronBootstrap').log('Cron 调度进程已启动（占位）');
  app.enableShutdownHooks();
  await app.init();
}

void bootstrap();
