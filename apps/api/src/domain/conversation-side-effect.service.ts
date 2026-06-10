import { Injectable } from '@nestjs/common';
import type { Prisma } from '@fitness/db';
import type { AiTaskType, MessageContentType } from '@fitness/shared';

import { PrismaService } from '../infra/prisma/prisma.service';

@Injectable()
export class ConversationSideEffectService {
  constructor(private readonly prisma: PrismaService) {}

  async finalizeAssistantMessage(
    aiRunId: string,
    output: {
      status: 'DONE' | 'FAILED';
      taskType: AiTaskType;
      outputJson?: unknown;
      errorMsg?: string | null;
    },
  ): Promise<void> {
    const run = await this.prisma.client.aiRun.findUnique({
      where: { id: aiRunId },
      select: {
        id: true,
        conversationId: true,
        taskType: true,
        inputJson: true,
        assistantMessage: { select: { id: true } },
      },
    });
    if (!run?.conversationId || !run.assistantMessage) {
      return;
    }

    if (output.status === 'FAILED') {
      await this.prisma.client.message.update({
        where: { id: run.assistantMessage.id },
        data: {
          contentType: 'SYSTEM_NOTICE',
          content: output.errorMsg ?? '任务失败',
          metadata: { taskStatus: 'FAILED', taskType: run.taskType },
        },
      });
      return;
    }

    const { contentType, content, metadata } = this.buildAssistantPayload(
      output.taskType,
      output.outputJson,
      run.inputJson,
    );

    await this.prisma.client.message.update({
      where: { id: run.assistantMessage.id },
      data: {
        contentType,
        content,
        metadata: metadata as Prisma.InputJsonValue,
        aiRunId: run.id,
      },
    });

    await this.prisma.client.conversation.update({
      where: { id: run.conversationId },
      data: { updatedAt: new Date() },
    });
  }

  private buildAssistantPayload(
    taskType: AiTaskType,
    outputJson: unknown,
    inputJson?: unknown,
  ): { contentType: MessageContentType; content: string; metadata: Record<string, unknown> } {
    if (taskType === 'COACH_CHAT') {
      const parsed =
        typeof outputJson === 'object' && outputJson != null
          ? (outputJson as { reply?: string; suggestedActions?: unknown })
          : {};
      return {
        contentType: 'TEXT',
        content: parsed.reply ?? '已收到',
        metadata: {
          taskStatus: 'DONE',
          taskType,
          suggestedActions: parsed.suggestedActions ?? [],
        },
      };
    }

    if (taskType === 'PLAN_GENERATE_WORKOUT' || taskType === 'PLAN_GENERATE_MEAL') {
      const parsed =
        typeof outputJson === 'object' && outputJson != null
          ? (outputJson as { planId?: string })
          : {};
      const label = taskType === 'PLAN_GENERATE_WORKOUT' ? '训练' : '饮食';
      return {
        contentType: 'PLAN_CARD',
        content: `${label}计划已生成，点击查看详情`,
        metadata: {
          taskStatus: 'DONE',
          taskType,
          planId: parsed.planId,
          planType: taskType === 'PLAN_GENERATE_WORKOUT' ? 'WORKOUT' : 'MEAL',
          requiresConfirmation: true,
        },
      };
    }

    if (taskType === 'MEAL_VISION') {
      const parsed =
        typeof outputJson === 'object' && outputJson != null
          ? (outputJson as { items?: unknown[] })
          : {};
      const input =
        typeof inputJson === 'object' && inputJson != null
          ? (inputJson as { mealType?: string })
          : {};
      return {
        contentType: 'MEAL_VISION_CARD',
        content: '餐食识别完成，请确认后记录',
        metadata: {
          taskStatus: 'DONE',
          taskType,
          result: outputJson,
          mealType: input.mealType ?? 'LUNCH',
          itemCount: Array.isArray(parsed.items) ? parsed.items.length : 0,
          requiresConfirmation: true,
        },
      };
    }

    return {
      contentType: 'TEXT',
      content: '任务已完成',
      metadata: { taskStatus: 'DONE', taskType, result: outputJson },
    };
  }
}
