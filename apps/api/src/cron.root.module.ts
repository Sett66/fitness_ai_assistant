import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { envValidationSchema } from './config/env.schema';

import { CronPlaceholderService } from './cron/cron-placeholder.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envValidationSchema }),
    ScheduleModule.forRoot(),
  ],
  providers: [CronPlaceholderService],
})
export class CronRootModule {}
