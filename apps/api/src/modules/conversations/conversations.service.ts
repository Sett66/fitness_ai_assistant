import { AiCoreError, runCoachChatStream } from '@fitness/ai-core';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { type Queue } from 'bullmq';
import type {
  AiTaskType,
  CoachChatOutput,
  CoachMessageAcceptedResponse,
  CoachToolTraceItem,
  ConversationWithMessages,
  CreateCoachMessageInput,
  LocationContext,
  Message,
} from '@fitness/shared';
import {
  CoachMessageAcceptedResponseSchema,
  ConversationListResponseSchema,
  ConversationWithMessagesSchema,
  CreateCoachMessageSchema,
  CreateConversationSchema,
  LLM_MODELS,
  MessageSchema,
  errorMessagesZhCN,
  getAiTaskDailyLimit,
} from '@fitness/shared';
import type { Prisma } from '@fitness/db';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import { AgentConfigService } from '../../config/agent-config.service';
import { CoachAgentRunner } from '../../domain/agent/coach-agent.runner';
import { AgentMemoryService } from '../../domain/agent-memory.service';
import { UserContextService } from '../../domain/user-context.service';
import { AI_TASK_QUEUE_NAME, type AiTaskJobPayload } from '../../infra/queue/queue.constants';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MealLogsService } from '../meal-logs/meal-logs.service';

export type SseEmitFn = (event: string, data: unknown) => void;

const DEFAULT_MESSAGE_LIMIT = 50;

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mealLogs: MealLogsService,
    private readonly userContext: UserContextService,
    private readonly agentMemory: AgentMemoryService,
    private readonly agentConfig: AgentConfigService,
    private readonly coachAgentRunner: CoachAgentRunner,
    @InjectQueue(AI_TASK_QUEUE_NAME) private readonly queue: Queue<AiTaskJobPayload>,
  ) {}

  async getDefault(user: JwtUserPayload): Promise<ConversationWithMessages> {
    const conversation = await this.ensureDefaultConversation(user.userId);
    const messages = await this.listRecentMessages(conversation.id);
    return ConversationWithMessagesSchema.parse({
      ...conversation,
      messages,
    });
  }

  async listConversations(user: JwtUserPayload, cursor?: string) {
    const take = 30;
    const meaningfulMessage = {
      OR: [
        { role: 'USER' as const },
        { role: 'ASSISTANT' as const, contentType: { not: 'SYSTEM_NOTICE' as const } },
      ],
    };

    const rows = await this.prisma.client.conversation.findMany({
      where: {
        userId: user.userId,
        messages: { some: meaningfulMessage },
        ...(cursor ? { updatedAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
      take: take + 1,
      include: {
        _count: {
          select: {
            messages: {
              where: meaningfulMessage,
            },
          },
        },
      },
    });

    const hasMore = rows.length > take;
    const slice = hasMore ? rows.slice(0, take) : rows;
    const items = await Promise.all(
      slice.map(async (row) => {
        const lastMessage = await this.prisma.client.message.findFirst({
          where: {
            conversationId: row.id,
            ...meaningfulMessage,
          },
          orderBy: { createdAt: 'desc' },
          select: { content: true },
        });
        return {
          id: row.id,
          title: row.title,
          isDefault: row.isDefault,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          messageCount: row._count.messages,
          preview: lastMessage?.content?.slice(0, 120) ?? null,
        };
      }),
    );

    const nextCursor = hasMore ? (slice[slice.length - 1]?.updatedAt.toISOString() ?? null) : null;
    return ConversationListResponseSchema.parse({ items, nextCursor });
  }

  async createConversation(user: JwtUserPayload, body: unknown) {
    const input = parseWith(CreateConversationSchema, body);
    const conversation = await this.prisma.client.conversation.create({
      data: {
        userId: user.userId,
        isDefault: false,
        title: input.title ?? null,
      },
    });
    return ConversationWithMessagesSchema.parse({
      ...conversation,
      messages: [],
    });
  }

  async getById(user: JwtUserPayload, conversationId: string): Promise<ConversationWithMessages> {
    await this.assertConversationOwner(user.userId, conversationId);
    const conversation = await this.prisma.client.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    const messages = await this.listRecentMessages(conversationId);
    return ConversationWithMessagesSchema.parse({
      ...conversation,
      messages,
    });
  }

  async listMessages(
    user: JwtUserPayload,
    conversationId: string,
    cursor?: string,
  ): Promise<{ items: Message[]; nextCursor: string | null }> {
    await this.assertConversationOwner(user.userId, conversationId);
    const take = 30;
    const rows = await this.prisma.client.message.findMany({
      where: {
        conversationId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const slice = hasMore ? rows.slice(0, take) : rows;
    const items = slice.reverse().map((row) => MessageSchema.parse(row));
    const nextCursor = hasMore ? (slice[0]?.createdAt.toISOString() ?? null) : null;
    return { items, nextCursor };
  }

  async postMessage(
    user: JwtUserPayload,
    conversationId: string,
    body: unknown,
  ): Promise<CoachMessageAcceptedResponse> {
    await this.assertConversationOwner(user.userId, conversationId);
    const input = parseWith(CreateCoachMessageSchema, body) as CreateCoachMessageInput;

    if (input.action === 'MANUAL_MEAL_LOG') {
      return this.handleManualMealLog(user, conversationId, input);
    }

    const userMessage = await this.prisma.client.message.create({
      data: {
        conversationId,
        role: 'USER',
        contentType: input.contentType === 'IMAGE' ? 'IMAGE' : 'TEXT',
        content: input.content ?? (input.action === 'MEAL_VISION' ? '[餐照]' : ''),
        metadata: {
          action: input.action,
          imageObjectKey: input.imageObjectKey ?? null,
          mealType: input.mealType ?? null,
          ...(input.locationContext ? { locationContext: input.locationContext } : {}),
        },
      },
    });

    await this.maybeSetConversationTitle(
      conversationId,
      userMessage.content,
      input.action === 'CHAT',
    );

    const pendingAssistant = await this.prisma.client.message.create({
      data: {
        conversationId,
        role: 'ASSISTANT',
        contentType: 'SYSTEM_NOTICE',
        content: this.pendingLabel(input.action),
        metadata: { taskStatus: 'RUNNING', action: input.action },
      },
    });

    const { taskType, model, inputJson } = this.buildAiRunPayload(
      user.userId,
      conversationId,
      input,
    );
    await this.assertDailyLimit(user.userId, taskType);

    const run = await this.prisma.client.aiRun.create({
      data: {
        userId: user.userId,
        taskType,
        model,
        status: 'QUEUED',
        inputJson: inputJson as Prisma.InputJsonValue,
        conversationId,
        triggerMessageId: userMessage.id,
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
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return CoachMessageAcceptedResponseSchema.parse({
      userMessageId: userMessage.id,
      taskId: run.id,
      pendingAssistantMessageId: pendingAssistant.id,
    });
  }

  async postMessageStream(
    user: JwtUserPayload,
    conversationId: string,
    body: unknown,
    emit: SseEmitFn,
  ): Promise<void> {
    await this.assertConversationOwner(user.userId, conversationId);
    const input = parseWith(CreateCoachMessageSchema, body) as CreateCoachMessageInput;

    if (input.action !== 'CHAT') {
      throw new BizException('VALIDATION_FAILED', '流式接口仅支持 CHAT', 400);
    }

    const latestUserText = String(input.content ?? '').trim();
    if (!latestUserText) {
      throw new BizException('VALIDATION_FAILED', errorMessagesZhCN.VALIDATION_FAILED, 400);
    }

    const timezoneOffsetMinutes = input.timezoneOffsetMinutes ?? 480;
    const model = LLM_MODELS.DEEPSEEK_V4_PRO;
    const startedAt = Date.now();

    await this.assertDailyLimit(user.userId, 'COACH_CHAT');

    const userMessage = await this.prisma.client.message.create({
      data: {
        conversationId,
        role: 'USER',
        contentType: 'TEXT',
        content: latestUserText,
        metadata: {
          action: 'CHAT',
          ...(input.locationContext ? { locationContext: input.locationContext } : {}),
        },
      },
    });

    await this.maybeSetConversationTitle(conversationId, latestUserText, true);

    const pendingAssistant = await this.prisma.client.message.create({
      data: {
        conversationId,
        role: 'ASSISTANT',
        contentType: 'SYSTEM_NOTICE',
        content: this.pendingLabel('CHAT'),
        metadata: { taskStatus: 'RUNNING', action: 'CHAT' },
      },
    });

    const run = await this.prisma.client.aiRun.create({
      data: {
        userId: user.userId,
        taskType: 'COACH_CHAT',
        model,
        status: 'RUNNING',
        inputJson: {
          content: latestUserText,
          conversationId,
          timezoneOffsetMinutes,
          ...(input.locationContext ? { locationContext: input.locationContext } : {}),
        } as Prisma.InputJsonValue,
        conversationId,
        triggerMessageId: userMessage.id,
      },
    });

    await this.prisma.client.message.update({
      where: { id: pendingAssistant.id },
      data: { aiRunId: run.id },
    });

    emit('accepted', {
      userMessageId: userMessage.id,
      pendingAssistantMessageId: pendingAssistant.id,
    });

    try {
      const history = await this.loadCoachChatHistory(conversationId);
      const userCtx = await this.userContext.build(user.userId, { timezoneOffsetMinutes });
      const memoryFacts = await this.agentMemory.listForPrompt(user.userId);

      if (this.agentConfig.isCoachAgentEnabled()) {
        await this.runCoachAgentStreamPath({
          user,
          conversationId,
          latestUserText,
          history,
          userCtx,
          memoryFacts,
          timezoneOffsetMinutes,
          locationContext: input.locationContext,
          pendingAssistantId: pendingAssistant.id,
          userMessageId: userMessage.id,
          runId: run.id,
          startedAt,
          model,
          emit,
        });
        return;
      }

      const stream = runCoachChatStream(
        { latestUserText, history, userContext: userCtx, memoryFacts },
        { model },
      );

      let result = await stream.next();
      while (!result.done) {
        emit('delta', { text: result.value.text });
        result = await stream.next();
      }

      const finalResult = result.value;
      const suggestedActions = finalResult.suggestedActions ?? [];

      await this.persistCoachChatSuccess({
        pendingAssistantId: pendingAssistant.id,
        userMessageId: userMessage.id,
        runId: run.id,
        conversationId,
        reply: finalResult.reply,
        suggestedActions,
        usage: finalResult.usage,
        startedAt,
      });

      emit('done', {
        assistantMessageId: pendingAssistant.id,
        userMessageId: userMessage.id,
        suggestedActions,
        usage: finalResult.usage,
      });

      void this.enqueueMemoryExtractSafely(user, {
        conversationId,
        userMessageId: userMessage.id,
        assistantMessageId: pendingAssistant.id,
        latestUserText,
        assistantReply: finalResult.reply,
      });
    } catch (err: unknown) {
      const message = this.toStreamErrorMessage(err);
      const code =
        err instanceof AiCoreError ? err.code : err instanceof BizException ? err.code : undefined;

      await this.prisma.client.message.update({
        where: { id: pendingAssistant.id },
        data: {
          contentType: 'SYSTEM_NOTICE',
          content: message,
          metadata: { taskStatus: 'FAILED', taskType: 'COACH_CHAT' } as Prisma.InputJsonValue,
        },
      });

      await this.prisma.client.aiRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          errorMsg: message,
          durationMs: Date.now() - startedAt,
        },
      });

      emit('error', { message, code });
    }
  }

  private async runCoachAgentStreamPath(params: {
    user: JwtUserPayload;
    conversationId: string;
    latestUserText: string;
    history: Awaited<ReturnType<ConversationsService['loadCoachChatHistory']>>;
    userCtx: Awaited<ReturnType<UserContextService['build']>>;
    memoryFacts: Awaited<ReturnType<AgentMemoryService['listForPrompt']>>;
    timezoneOffsetMinutes: number;
    locationContext?: LocationContext;
    pendingAssistantId: string;
    userMessageId: string;
    runId: string;
    startedAt: number;
    model: string;
    emit: SseEmitFn;
  }): Promise<void> {
    const runner = this.coachAgentRunner.run(
      params.user.userId,
      {
        latestUserText: params.latestUserText,
        history: params.history,
        userContext: params.userCtx,
        memoryFacts: params.memoryFacts,
        locationContext: params.locationContext,
        timezoneOffsetMinutes: params.timezoneOffsetMinutes,
        conversationId: params.conversationId,
      },
      { model: params.model },
    );

    let finalReply = '';
    let suggestedActions: CoachChatOutput['suggestedActions'] = [];
    let usage = { tokenIn: 0, tokenOut: 0, costCny: 0 };
    let toolTrace: CoachToolTraceItem[] = [];

    for await (const event of runner) {
      if (event.type === 'delta') {
        finalReply = event.text;
        params.emit('delta', { text: event.text });
      } else if (event.type === 'tool_start') {
        params.emit('tool_start', { name: event.name, label: event.label });
      } else if (event.type === 'tool_end') {
        params.emit('tool_end', { name: event.name, ok: event.ok, summary: event.summary });
      } else if (event.type === 'done') {
        finalReply = event.reply;
        suggestedActions = event.suggestedActions ?? [];
        usage = event.usage;
        toolTrace = event.toolTrace;
      }
    }

    await this.persistCoachChatSuccess({
      pendingAssistantId: params.pendingAssistantId,
      userMessageId: params.userMessageId,
      runId: params.runId,
      conversationId: params.conversationId,
      reply: finalReply,
      suggestedActions,
      usage,
      startedAt: params.startedAt,
      toolTrace,
    });

    params.emit('done', {
      assistantMessageId: params.pendingAssistantId,
      userMessageId: params.userMessageId,
      suggestedActions,
      toolTrace,
      usage,
    });

    void this.enqueueMemoryExtractSafely(params.user, {
      conversationId: params.conversationId,
      userMessageId: params.userMessageId,
      assistantMessageId: params.pendingAssistantId,
      latestUserText: params.latestUserText,
      assistantReply: finalReply,
    });
  }

  private async persistCoachChatSuccess(params: {
    pendingAssistantId: string;
    userMessageId: string;
    runId: string;
    conversationId: string;
    reply: string;
    suggestedActions: unknown;
    usage: { tokenIn: number; tokenOut: number; costCny: number };
    startedAt: number;
    toolTrace?: CoachToolTraceItem[];
  }): Promise<void> {
    await this.prisma.client.message.update({
      where: { id: params.pendingAssistantId },
      data: {
        contentType: 'TEXT',
        content: params.reply,
        metadata: {
          taskStatus: 'DONE',
          taskType: 'COACH_CHAT',
          suggestedActions: params.suggestedActions,
          ...(params.toolTrace?.length ? { toolTrace: params.toolTrace } : {}),
        } as Prisma.InputJsonValue,
        aiRunId: params.runId,
      },
    });

    await this.prisma.client.aiRun.update({
      where: { id: params.runId },
      data: {
        status: 'DONE',
        outputJson: {
          reply: params.reply,
          suggestedActions: params.suggestedActions,
          ...(params.toolTrace?.length ? { toolTrace: params.toolTrace } : {}),
        } as Prisma.InputJsonValue,
        tokenIn: params.usage.tokenIn,
        tokenOut: params.usage.tokenOut,
        costCny: params.usage.costCny,
        durationMs: Date.now() - params.startedAt,
      },
    });

    await this.prisma.client.conversation.update({
      where: { id: params.conversationId },
      data: { updatedAt: new Date() },
    });
  }

  private enqueueMemoryExtractSafely(
    user: JwtUserPayload,
    input: {
      conversationId: string;
      userMessageId: string;
      assistantMessageId: string;
      latestUserText: string;
      assistantReply: string;
    },
  ): void {
    void this.agentMemory.enqueueMemoryExtract(user.userId, input).catch((err: unknown) => {
      this.logger.warn(`记忆抽取入队失败: ${this.toStreamErrorMessage(err)}`);
    });
  }

  private async loadCoachChatHistory(conversationId: string) {
    const historyRows = await this.prisma.client.message.findMany({
      where: {
        conversationId,
        role: { in: ['USER', 'ASSISTANT'] },
        contentType: { in: ['TEXT', 'SYSTEM_NOTICE'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return historyRows
      .reverse()
      .filter((row) => row.content && row.content !== '思考中…')
      .map((row) => ({
        role: row.role as 'USER' | 'ASSISTANT',
        content: row.content.slice(0, 2000),
      }));
  }

  private toStreamErrorMessage(err: unknown): string {
    if (err instanceof AiCoreError) {
      return `[${err.code}] ${err.message}`.slice(0, 2048);
    }
    if (err instanceof BizException) {
      return err.message.slice(0, 2048);
    }
    if (err instanceof Error) {
      return err.message.slice(0, 2048);
    }
    return String(err).slice(0, 2048);
  }

  private async handleManualMealLog(
    user: JwtUserPayload,
    conversationId: string,
    input: CreateCoachMessageInput,
  ): Promise<CoachMessageAcceptedResponse> {
    const manualMeal = input.actionParams!.manualMeal!;
    const userMessage = await this.prisma.client.message.create({
      data: {
        conversationId,
        role: 'USER',
        contentType: 'TEXT',
        content: input.content ?? '手动记录饮食',
        metadata: { action: 'MANUAL_MEAL_LOG' },
      },
    });

    const created = await this.mealLogs.create(user, manualMeal);

    const assistant = await this.prisma.client.message.create({
      data: {
        conversationId,
        role: 'ASSISTANT',
        contentType: 'TEXT',
        content: `已记录 ${manualMeal.totalKcal} kcal`,
        metadata: {
          taskStatus: 'DONE',
          action: 'MANUAL_MEAL_LOG',
          mealLogId: created.id,
        },
      },
    });

    return CoachMessageAcceptedResponseSchema.parse({
      userMessageId: userMessage.id,
      taskId: null,
      pendingAssistantMessageId: assistant.id,
    });
  }

  private buildAiRunPayload(
    userId: string,
    conversationId: string,
    input: CreateCoachMessageInput,
  ): { taskType: AiTaskType; model: string; inputJson: Record<string, unknown> } {
    const timezoneOffsetMinutes = input.timezoneOffsetMinutes ?? 480;
    const params = input.actionParams ?? {};

    if (input.action === 'CHAT') {
      return {
        taskType: 'COACH_CHAT',
        model: LLM_MODELS.DEEPSEEK_V4_PRO,
        inputJson: {
          content: input.content,
          conversationId,
          timezoneOffsetMinutes,
          ...(input.locationContext ? { locationContext: input.locationContext } : {}),
        },
      };
    }

    if (input.action === 'GENERATE_WORKOUT') {
      return {
        taskType: 'PLAN_GENERATE_WORKOUT',
        model: LLM_MODELS.DEEPSEEK_V4_PRO,
        inputJson: {
          mesocycleWeeks: params.mesocycleWeeks ?? 4,
          notes: params.notes ?? input.content ?? '',
          preferences: params.preferences,
          timezoneOffsetMinutes,
        },
      };
    }

    if (input.action === 'GENERATE_MEAL') {
      return {
        taskType: 'PLAN_GENERATE_MEAL',
        model: LLM_MODELS.DEEPSEEK_V4_PRO,
        inputJson: {
          mesocycleWeeks: params.mesocycleWeeks ?? 4,
          notes: params.notes ?? input.content ?? '',
          timezoneOffsetMinutes,
        },
      };
    }

    if (input.action === 'MEAL_VISION') {
      return {
        taskType: 'MEAL_VISION',
        model: LLM_MODELS.QWEN_VL_MAX,
        inputJson: {
          objectKey: input.imageObjectKey,
          mealType: input.mealType,
          saveMealLog: params.saveMealLog ?? false,
          notes: input.content,
          timezoneOffsetMinutes,
        },
      };
    }

    throw new BizException('VALIDATION_FAILED', errorMessagesZhCN.VALIDATION_FAILED, 400);
  }

  private async maybeSetConversationTitle(
    conversationId: string,
    text: string,
    fromChat: boolean,
  ): Promise<void> {
    if (!fromChat) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const conversation = await this.prisma.client.conversation.findUnique({
      where: { id: conversationId },
      select: { title: true },
    });
    if (!conversation || conversation.title) {
      return;
    }

    await this.prisma.client.conversation.update({
      where: { id: conversationId },
      data: { title: trimmed.slice(0, 20) },
    });
  }

  private pendingLabel(action: string): string {
    switch (action) {
      case 'CHAT':
        return '思考中…';
      case 'GENERATE_WORKOUT':
        return '正在生成训练计划…';
      case 'GENERATE_MEAL':
        return '正在生成饮食计划…';
      case 'MEAL_VISION':
        return '正在识别餐食…';
      default:
        return '处理中…';
    }
  }

  private async ensureDefaultConversation(userId: string) {
    const existing = await this.prisma.client.conversation.findFirst({
      where: { userId, isDefault: true },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.client.conversation.create({
      data: {
        userId,
        isDefault: true,
        title: '教练 Alex',
      },
    });
  }

  private async listRecentMessages(conversationId: string) {
    const rows = await this.prisma.client.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: DEFAULT_MESSAGE_LIMIT,
    });
    return rows.reverse().map((row) => MessageSchema.parse(row));
  }

  private async assertConversationOwner(userId: string, conversationId: string) {
    const conversation = await this.prisma.client.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!conversation) {
      throw new BizException(
        'CONVERSATION_NOT_FOUND',
        errorMessagesZhCN.CONVERSATION_NOT_FOUND,
        404,
      );
    }
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
