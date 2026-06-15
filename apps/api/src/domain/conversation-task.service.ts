import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { type Queue } from 'bullmq';
import type { AiTaskType } from '@fitness/shared';
import type { Prisma } from '@fitness/db';
import { errorMessagesZhCN, getAiTaskDailyLimit } from '@fitness/shared';

import { BizException } from '../common/exceptions/biz-exception';
import { AI_TASK_QUEUE_NAME, type AiTaskJobPayload } from '../infra/queue/queue.constants';
import { PrismaService } from '../infra/prisma/prisma.service';

export type EnqueueConversationTaskParams = {
  userId: string;
  conversationId: string;
  triggerMessageId: string;
  taskType: AiTaskType;
  model: string;
  inputJson: Record<string, unknown>;
  pendingContent: string;
  pendingAction: string;
};

export type EnqueueConversationTaskResult = {
  taskId: string;
  pendingAssistantMessageId: string;
};

@Injectable()
export class ConversationTaskService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(AI_TASK_QUEUE_NAME) private readonly queue: Queue<AiTaskJobPayload>,
  ) {}

  async getDailyLimitMessage(userId: string, taskType: AiTaskType): Promise<string | null> {
    const exceeded = await this.isDailyLimitExceeded(userId, taskType);
    return exceeded ? errorMessagesZhCN.AI_TASK_LIMIT_EXCEEDED : null;
  }

  async assertDailyLimit(userId: string, taskType: AiTaskType): Promise<void> {
    const message = await this.getDailyLimitMessage(userId, taskType);
    if (message) {
      throw new BizException('AI_TASK_LIMIT_EXCEEDED', message, 429);
    }
  }

  async enqueueConversationTask(
    params: EnqueueConversationTaskParams,
  ): Promise<EnqueueConversationTaskResult> {
    await this.assertDailyLimit(params.userId, params.taskType);

    const pendingAssistant = await this.prisma.client.message.create({
      data: {
        conversationId: params.conversationId,
        role: 'ASSISTANT',
        contentType: 'SYSTEM_NOTICE',
        content: params.pendingContent,
        metadata: {
          taskStatus: 'RUNNING',
          action: params.pendingAction,
        },
      },
    });

    const run = await this.prisma.client.aiRun.create({
      data: {
        userId: params.userId,
        taskType: params.taskType,
        model: params.model,
        status: 'QUEUED',
        inputJson: params.inputJson as Prisma.InputJsonValue,
        conversationId: params.conversationId,
        triggerMessageId: params.triggerMessageId,
      },
    });

    await this.prisma.client.message.update({
      where: { id: pendingAssistant.id },
      data: { aiRunId: run.id },
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

    await this.prisma.client.conversation.update({
      where: { id: params.conversationId },
      data: { updatedAt: new Date() },
    });

    return {
      taskId: run.id,
      pendingAssistantMessageId: pendingAssistant.id,
    };
  }

  private async isDailyLimitExceeded(userId: string, taskType: AiTaskType): Promise<boolean> {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const count = await this.prisma.client.aiRun.count({
      where: { userId, taskType, createdAt: { gte: start } },
    });
    return count >= getAiTaskDailyLimit(taskType);
  }
}
