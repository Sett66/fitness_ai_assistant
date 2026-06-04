import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { type Queue } from 'bullmq';
import type { AiTaskAcceptedResponse, AiTaskStatusResponse } from '@fitness/shared';
import { CreateAiRunSchema, errorMessagesZhCN, getAiTaskDailyLimit } from '@fitness/shared';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import { AI_TASK_QUEUE_NAME, type AiTaskJobPayload } from '../../infra/queue/queue.constants';
import { type PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class AiTasksService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(AI_TASK_QUEUE_NAME) private readonly queue: Queue<AiTaskJobPayload>,
  ) {}

  async enqueue(user: JwtUserPayload, body: unknown): Promise<AiTaskAcceptedResponse> {
    const input = parseWith(CreateAiRunSchema, body);
    await this.assertDailyLimit(user.userId, input.taskType);

    const run = await this.prisma.client.aiRun.create({
      data: {
        userId: user.userId,
        taskType: input.taskType,
        model: input.model,
        status: 'QUEUED',
        inputJson: input.inputJson ?? {},
      },
    });

    await this.queue.add(
      'default',
      { aiRunId: run.id },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return { taskId: run.id };
  }

  async getStatus(user: JwtUserPayload, id: string): Promise<AiTaskStatusResponse> {
    const run = await this.prisma.client.aiRun.findFirst({
      where: { id, userId: user.userId },
    });
    if (!run) {
      throw new BizException('AI_TASK_NOT_FOUND', errorMessagesZhCN.AI_TASK_NOT_FOUND, 404);
    }
    return {
      taskId: run.id,
      status: run.status,
      taskType: run.taskType,
      result: run.outputJson ?? null,
      errorMsg: run.errorMsg ?? null,
    };
  }

  private async assertDailyLimit(userId: string, taskType: string): Promise<void> {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const count = await this.prisma.client.aiRun.count({
      where: { userId, taskType: taskType as never, createdAt: { gte: start } },
    });
    const limit = getAiTaskDailyLimit(taskType);
    if (count >= limit) {
      throw new BizException(
        'AI_TASK_LIMIT_EXCEEDED',
        errorMessagesZhCN.AI_TASK_LIMIT_EXCEEDED,
        429,
      );
    }
  }
}
