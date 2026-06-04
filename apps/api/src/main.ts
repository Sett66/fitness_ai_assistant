import 'reflect-metadata';

import { loadApiEnv } from './load-api-env';

loadApiEnv();

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  const cfg = app.get(ConfigService);
  const port = cfg.get<number>('PORT') ?? 3000;
  const nodeEnv = cfg.get<string>('NODE_ENV') ?? 'development';

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.setGlobalPrefix('v1');

  if (nodeEnv !== 'production') {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Fitness AI Assistant · API')
        .setDescription('M2 · OpenAPI（仅开发环境启用）')
        .setVersion('0.0.0-m2')
        .addBearerAuth(
          {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            in: 'header',
          },
          'access-token',
        )
        .build(),
    );

    SwaggerModule.setup('swagger', app, doc);
  }

  await app.listen(port);
  new Logger('Bootstrap').log(`HTTP 已启动：http://127.0.0.1:${port}/v1（Swagger：/swagger）`);
}

void bootstrap();
