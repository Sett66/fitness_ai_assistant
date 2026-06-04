import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

import { AI_TASK_QUEUE_NAME } from './queue.constants';

@Global()
@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>('REDIS_URL');
        return {
          connection: new IORedis(url, {
            maxRetriesPerRequest: null,
          }),
        };
      },
    }),
    BullModule.registerQueue({
      name: AI_TASK_QUEUE_NAME,
    }),
  ],
  exports: [BullModule],
})
export class FitnessQueueModule {}
