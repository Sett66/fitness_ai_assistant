import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  AiCoreError,
  runCoachChat,
  runMealPlanGenerator,
  runMealVision,
  runMealVisionWithAdvice,
  runWorkoutPlanGenerator,
  type LlmUsage,
} from '@fitness/ai-core';
import type { Prisma } from '@fitness/db';
import type { MealType } from '@fitness/shared';
import { MealVisionTaskInputSchema } from '@fitness/shared';
import type { Job } from 'bullmq';

import { ConversationSideEffectService } from '../domain/conversation-side-effect.service';
import { NutritionDailyService } from '../domain/nutrition-daily.service';
import { PlanPersistenceService } from '../domain/plan-persistence.service';
import { UserContextService } from '../domain/user-context.service';
import { PrismaService } from '../infra/prisma/prisma.service';
import { S3StorageService } from '../infra/storage/s3-storage.service';
import { AI_TASK_QUEUE_NAME, type AiTaskJobPayload } from '../infra/queue/queue.constants';
import { MealLogsService } from '../modules/meal-logs/meal-logs.service';

type AiTaskOutput = {
  outputJson: unknown;
  usage: LlmUsage;
};

@Processor(AI_TASK_QUEUE_NAME)
export class AiTaskProcessor extends WorkerHost {
  private readonly logger = new Logger(AiTaskProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
    private readonly nutritionDaily: NutritionDailyService,
    private readonly planPersistence: PlanPersistenceService,
    private readonly mealLogs: MealLogsService,
    private readonly storage: S3StorageService,
    private readonly conversationSideEffects: ConversationSideEffectService,
  ) {
    super();
  }

  async process(job: Job<AiTaskJobPayload>): Promise<void> {
    const { aiRunId } = job.data;
    const startedAt = Date.now();
    this.logger.log(`处理 AI 任务: ${aiRunId}`);

    const run = await this.prisma.client.aiRun.update({
      where: { id: aiRunId },
      data: {
        status: 'RUNNING',
        errorMsg: null,
      },
    });

    try {
      const result = await this.dispatch(
        run.taskType,
        run.model,
        run.userId,
        run.id,
        run.inputJson,
      );
      await this.prisma.client.aiRun.update({
        where: { id: aiRunId },
        data: {
          status: 'DONE',
          outputJson: toJsonValue(result.outputJson),
          tokenIn: result.usage.tokenIn,
          tokenOut: result.usage.tokenOut,
          costCny: result.usage.costCny,
          durationMs: Date.now() - startedAt,
        },
      });
      await this.conversationSideEffects.finalizeAssistantMessage(aiRunId, {
        status: 'DONE',
        taskType: run.taskType,
        outputJson: result.outputJson,
      });
    } catch (err: unknown) {
      const message = this.toErrorMessage(err);
      await this.prisma.client.aiRun.update({
        where: { id: aiRunId },
        data: {
          status: 'FAILED',
          errorMsg: message,
          durationMs: Date.now() - startedAt,
        },
      });
      await this.conversationSideEffects.finalizeAssistantMessage(aiRunId, {
        status: 'FAILED',
        taskType: run.taskType,
        errorMsg: message,
      });
      this.logger.error(`AI 任务失败: ${aiRunId}: ${message}`);
      throw err;
    }
  }

  private async dispatch(
    taskType: string,
    model: string,
    userId: string,
    aiRunId: string,
    inputJson: unknown,
  ): Promise<AiTaskOutput> {
    const clientInput =
      typeof inputJson === 'object' && inputJson != null
        ? (inputJson as Record<string, unknown>)
        : {};
    const timezoneOffsetMinutes = Number(clientInput.timezoneOffsetMinutes ?? 480);

    if (taskType === 'COACH_CHAT') {
      return this.dispatchCoachChat(userId, model, clientInput, timezoneOffsetMinutes);
    }

    if (taskType === 'MEAL_VISION') {
      return this.dispatchMealVision(userId, model, clientInput, timezoneOffsetMinutes);
    }

    if (taskType === 'PLAN_GENERATE_WORKOUT') {
      const merged = await this.userContext.mergePlanGeneratorInput(userId, clientInput, {
        timezoneOffsetMinutes,
      });
      const output = await runWorkoutPlanGenerator(merged, { model });
      const planId = await this.planPersistence.persistWorkoutPlan(
        userId,
        aiRunId,
        output.result,
        typeof merged.startDate === 'string' ? merged.startDate : undefined,
      );
      return {
        outputJson: { ...output.result, planId },
        usage: output.usage,
      };
    }

    if (taskType === 'PLAN_GENERATE_MEAL') {
      const merged = await this.userContext.mergePlanGeneratorInput(userId, clientInput, {
        timezoneOffsetMinutes,
      });
      const output = await runMealPlanGenerator(merged, { model });
      const planId = await this.planPersistence.persistMealPlan(
        userId,
        aiRunId,
        output.result,
        typeof merged.startDate === 'string' ? merged.startDate : undefined,
      );
      return {
        outputJson: { ...output.result, planId },
        usage: output.usage,
      };
    }

    throw new AiCoreError('AI_CORE_UNSUPPORTED_TASK', `M3 暂未支持任务类型：${taskType}`);
  }

  private async dispatchCoachChat(
    userId: string,
    model: string,
    clientInput: Record<string, unknown>,
    timezoneOffsetMinutes: number,
  ): Promise<AiTaskOutput> {
    const latestUserText = String(clientInput.content ?? '').trim();
    if (!latestUserText) {
      throw new AiCoreError('AI_CORE_UNSUPPORTED_TASK', 'COACH_CHAT 缺少 content');
    }

    const conversationId =
      typeof clientInput.conversationId === 'string' ? clientInput.conversationId : null;

    const historyRows = conversationId
      ? await this.prisma.client.message.findMany({
          where: {
            conversationId,
            role: { in: ['USER', 'ASSISTANT'] },
            contentType: { in: ['TEXT', 'SYSTEM_NOTICE'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : [];

    const history = historyRows
      .reverse()
      .filter((row) => row.content && row.content !== '思考中…')
      .map((row) => ({
        role: row.role as 'USER' | 'ASSISTANT',
        content: row.content.slice(0, 2000),
      }));

    const userContext = await this.userContext.build(userId, { timezoneOffsetMinutes });
    const output = await runCoachChat({ latestUserText, history, userContext }, { model });

    return { outputJson: output.result, usage: output.usage };
  }

  private async dispatchMealVision(
    userId: string,
    model: string,
    clientInput: Record<string, unknown>,
    timezoneOffsetMinutes: number,
  ): Promise<AiTaskOutput> {
    const taskInput = MealVisionTaskInputSchema.parse(clientInput);
    const imageUrl = await this.resolveMealImageUrl(userId, taskInput);
    const nutritionContext = await this.nutritionDaily.buildTodaySummary(userId, {
      timezoneOffsetMinutes,
    });

    const visionInput = {
      imageUrl,
      notes: taskInput.notes,
      mealType: taskInput.mealType,
      nutritionContext: nutritionContext ?? undefined,
    };

    const output =
      nutritionContext != null
        ? await runMealVisionWithAdvice(visionInput, { model })
        : await runMealVision(visionInput, { model });

    const result = { ...output.result };

    if (taskInput.saveMealLog && result.items.length > 0) {
      const mealType = taskInput.mealType ?? inferMealType(new Date(), timezoneOffsetMinutes);
      const mealLogId = await this.mealLogs.createFromVisionResult(userId, result, {
        mealType,
        imageMediaId: taskInput.imageMediaId,
      });
      result.mealLogId = mealLogId;
    }

    return { outputJson: result, usage: output.usage };
  }

  private async resolveMealImageUrl(
    userId: string,
    taskInput: { imageUrl?: string; objectKey?: string },
  ): Promise<string> {
    if (taskInput.imageUrl) {
      return taskInput.imageUrl;
    }
    const objectKey = taskInput.objectKey;
    if (!objectKey) {
      throw new AiCoreError('AI_CORE_UNSUPPORTED_TASK', 'MEAL_VISION 缺少 imageUrl / objectKey');
    }
    const segments = objectKey.split('/');
    if (segments[1] !== userId) {
      throw new AiCoreError('AI_CORE_UNSUPPORTED_TASK', 'objectKey 与当前用户不匹配');
    }
    return this.storage.getObjectAsDataUrl(objectKey);
  }

  private toErrorMessage(err: unknown): string {
    if (err instanceof AiCoreError) {
      return `[${err.code}] ${err.message}`.slice(0, 2048);
    }
    if (err instanceof Error) {
      return err.message.slice(0, 2048);
    }
    return String(err).slice(0, 2048);
  }
}

const toJsonValue = (value: unknown): Prisma.InputJsonValue => {
  const jsonValue = JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue | undefined;
  return jsonValue ?? {};
};

const inferMealType = (at: Date, timezoneOffsetMinutes: number): MealType => {
  const shifted = new Date(at.getTime() + timezoneOffsetMinutes * 60_000);
  const hour = shifted.getUTCHours();
  if (hour >= 5 && hour < 10) {
    return 'BREAKFAST';
  }
  if (hour >= 10 && hour < 15) {
    return 'LUNCH';
  }
  if (hour >= 17 && hour < 22) {
    return 'DINNER';
  }
  return 'SNACK';
};
