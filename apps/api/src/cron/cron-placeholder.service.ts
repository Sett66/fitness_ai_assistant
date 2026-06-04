import { Injectable, Logger } from '@nestjs/common';

/**
 * M2：Cron 进程仅占位；mesocycle 复盘逻辑后续接入 `ScheduleModule`。
 */
@Injectable()
export class CronPlaceholderService {
  private readonly logger = new Logger(CronPlaceholderService.name);

  constructor() {
    this.logger.log('Cron 占位服务已注册（无定时任务）');
  }
}
