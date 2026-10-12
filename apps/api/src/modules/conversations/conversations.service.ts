import { AiCoreError, runCoachChatStream } from '@fitness/ai-core';
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AiTaskType,
  CoachChatObservability,
  CoachChatOutput,
  CoachMessageAcceptedResponse,
  CoachStreamStartResponse,
  CoachToolTraceItem,
  ConversationWithMessages,
  CreateCoachMessageInput,
  LocationContext,
  Message,
} from '@fitness/shared';
import {
  CoachMessageAcceptedResponseSchema,
  CoachStreamStartResponseSchema,
  ConversationListResponseSchema,
  ConversationWithMessagesSchema,
  CreateCoachMessageSchema,
  StartCoachStreamSchema,
  CreateConversationSchema,
  LLM_MODELS,
  MessageSchema,
  errorMessagesZhCN,
} from '@fitness/shared';
import type { Prisma } from '@fitness/db';

import type { JwtUserPayload } from '../../common/decorators/current-user.decorator';
import { BizException } from '../../common/exceptions/biz-exception';
import { parseWith } from '../../common/zod/parse-with';
import { AgentConfigService } from '../../config/agent-config.service';
import { CoachAgentRunner } from '../../domain/agent/coach-agent.runner';
import { CoachChatHistoryService } from '../../domain/coach-chat-history.service';
import type { CoachChatHistoryItem } from '../../domain/coach-chat-history.service';
import { CoachImageContextService } from '../../domain/coach-image-context.service';
import { AgentMemoryService } from '../../domain/agent-memory.service';
import { ConversationSideEffectService } from '../../domain/conversation-side-effect.service';
import { ConversationTaskService } from '../../domain/conversation-task.service';
import { UserContextService } from '../../domain/user-context.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { CoachChatTraceSession } from '../../infra/observability/coach-chat-trace.session';
import { LangfuseCoachTraceService } from '../../infra/observability/langfuse-coach-trace.service';
import { MealLogsService } from '../meal-logs/meal-logs.service';
import { CoachStreamRegistryService } from './coach-stream-registry.service';

export type SseEmitFn = (event: string, data: unknown) => Promise<void>;

const DEFAULT_MESSAGE_LIMIT = 50;
const MAX_CHAT_IMAGES = 5;

function normalizeImageObjectKeys(input: CreateCoachMessageInput): string[] {
  const keys = [...(input.imageObjectKeys ?? [])];
  if (input.imageObjectKey && !keys.includes(input.imageObjectKey)) {
    keys.unshift(input.imageObjectKey);
  }
  return keys.slice(0, MAX_CHAT_IMAGES);
}

function formatConversationPreview(
  message: { content: string; contentType: string; metadata: unknown } | null,
): string | null {
  if (!message?.content) {
    return null;
  }
  if (message.contentType === 'IMAGE') {
    const meta = (message.metadata ?? {}) as Record<string, unknown>;
    const count = Array.isArray(meta.imageObjectKeys) ? meta.imageObjectKeys.length : 1;
    const text = message.content.trim();
    const isPlaceholder = text === '[图片]' || /^\[\d+ 张图片\]$/.test(text);
    if (!isPlaceholder && text) {
      return `[${count}张图片] ${text}`.slice(0, 120);
    }
    return count > 1 ? `[${count}张图片]` : '[图片]';
  }
  if (message.contentType === 'PLAN_CARD' || message.contentType === 'MEAL_VISION_CARD') {
    return message.content.slice(0, 120);
  }
  return message.content.slice(0, 120);
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);
  private readonly activeStreams = new Map<string, AbortController>();
  private readonly streamPartialText = new Map<string, string>();
  private readonly pendingStreamPublishes = new Map<string, Promise<void>>();
  private readonly streamFlushers = new Map<string, () => Promise<void>>();
  private readonly streamTextSequences = new Map<string, number>();
  private readonly streamLastSequences = new Map<string, number>();
  private readonly streamToolTraces = new Map<string, CoachToolTraceItem[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mealLogs: MealLogsService,
    private readonly userContext: UserContextService,
    private readonly agentMemory: AgentMemoryService,
    private readonly agentConfig: AgentConfigService,
    private readonly coachAgentRunner: CoachAgentRunner,
    private readonly coachChatHistory: CoachChatHistoryService,
    private readonly coachImageContext: CoachImageContextService,
    private readonly conversationTask: ConversationTaskService,
    private readonly conversationSideEffects: ConversationSideEffectService,
    private readonly langfuseCoachTrace: LangfuseCoachTraceService,
    private readonly coachStreams: CoachStreamRegistryService,
  ) {}

  async getDefault(user: JwtUserPayload): Promise<ConversationWithMessages> {
    const conversation = await this.ensureDefaultConversation(user.userId);
    await this.conversationSideEffects.reconcileStaleAssistantMessages(conversation.id);
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
          select: { content: true, contentType: true, metadata: true },
        });
        return {
          id: row.id,
          title: row.title,
          isDefault: row.isDefault,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          messageCount: row._count.messages,
          preview: formatConversationPreview(lastMessage),
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
    await this.conversationSideEffects.reconcileStaleAssistantMessages(conversationId);
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

    const { taskType, model, inputJson } = this.buildAiRunPayload(
      user.userId,
      conversationId,
      input,
    );

    const enqueued = await this.conversationTask.enqueueConversationTask({
      userId: user.userId,
      conversationId,
      triggerMessageId: userMessage.id,
      taskType,
      model,
      inputJson,
      pendingContent: this.pendingLabel(input.action),
      pendingAction: input.action,
    });

    return CoachMessageAcceptedResponseSchema.parse({
      userMessageId: userMessage.id,
      taskId: enqueued.taskId,
      pendingAssistantMessageId: enqueued.pendingAssistantMessageId,
    });
  }

  async startMessageStream(
    user: JwtUserPayload,
    conversationId: string,
    body: unknown,
  ): Promise<CoachStreamStartResponse> {
    await this.assertConversationOwner(user.userId, conversationId);
    await this.conversationSideEffects.reconcileStaleAssistantMessages(conversationId);
    const input = parseWith(StartCoachStreamSchema, body) as CreateCoachMessageInput & {
      clientRequestId: string;
    };
    const existing = await this.prisma.client.aiRun.findUnique({
      where: { clientRequestId: input.clientRequestId },
      include: { triggerMessage: true, assistantMessage: true },
    });
    if (existing) {
      if (existing.userId !== user.userId || existing.conversationId !== conversationId) {
        throw new BizException('FORBIDDEN', 'clientRequestId 已被其他请求使用', 403);
      }
      return CoachStreamStartResponseSchema.parse({
        streamId: existing.id,
        userMessageId: existing.triggerMessageId,
        assistantMessageId: existing.assistantMessage?.id,
        status: existing.status,
      });
    }

    const rawUserText = String(input.content ?? '').trim();
    const imageObjectKeys = normalizeImageObjectKeys(input);
    if (!rawUserText && imageObjectKeys.length === 0) {
      throw new BizException('VALIDATION_FAILED', errorMessagesZhCN.VALIDATION_FAILED, 400);
    }

    const timezoneOffsetMinutes = input.timezoneOffsetMinutes ?? 480;
    // 聊天回复优先速度：使用 DeepSeek V4 Flash（计划生成等重任务仍走 Pro）
    const model = LLM_MODELS.DEEPSEEK_V4_FLASH;
    const startedAt = Date.now();

    try {
      await this.coachStreams.assertAvailable();
    } catch {
      throw new BizException(
        'COACH_STREAM_INFRA_UNAVAILABLE',
        errorMessagesZhCN.COACH_STREAM_INFRA_UNAVAILABLE,
        503,
      );
    }

    const displayContent =
      rawUserText ||
      (imageObjectKeys.length === 1 ? '[图片]' : `[${imageObjectKeys.length} 张图片]`);

    const { latestUserText } = await this.coachImageContext.augmentChatUserText(
      user.userId,
      rawUserText,
      imageObjectKeys,
    );
    const runId = randomUUID();
    try {
      await this.coachStreams.initialize(runId);
    } catch {
      throw new BizException(
        'COACH_STREAM_INFRA_UNAVAILABLE',
        errorMessagesZhCN.COACH_STREAM_INFRA_UNAVAILABLE,
        503,
      );
    }

    let userMessage!: Awaited<ReturnType<typeof this.prisma.client.message.create>>;
    let pendingAssistant!: Awaited<ReturnType<typeof this.prisma.client.message.create>>;
    let run!: Awaited<ReturnType<typeof this.prisma.client.aiRun.create>>;
    try {
      await this.conversationTask.assertDailyLimit(user.userId, 'COACH_CHAT');
      ({ userMessage, pendingAssistant, run } = await this.prisma.client.$transaction(
        async (tx) => {
          const createdUserMessage = await tx.message.create({
            data: {
              conversationId,
              role: 'USER',
              contentType: imageObjectKeys.length > 0 ? 'IMAGE' : 'TEXT',
              content: displayContent,
              metadata: {
                action: 'CHAT',
                ...(imageObjectKeys.length ? { imageObjectKeys } : {}),
                ...(input.locationContext ? { locationContext: input.locationContext } : {}),
              },
            },
          });
          const createdRun = await tx.aiRun.create({
            data: {
              id: runId,
              clientRequestId: input.clientRequestId,
              userId: user.userId,
              taskType: 'COACH_CHAT',
              model,
              status: 'RUNNING',
              inputJson: {
                content: latestUserText,
                rawUserText: rawUserText || undefined,
                imageObjectKeys: imageObjectKeys.length ? imageObjectKeys : undefined,
                conversationId,
                timezoneOffsetMinutes,
                ...(input.locationContext ? { locationContext: input.locationContext } : {}),
              } as Prisma.InputJsonValue,
              conversationId,
              triggerMessageId: createdUserMessage.id,
            },
          });
          const createdAssistant = await tx.message.create({
            data: {
              conversationId,
              role: 'ASSISTANT',
              contentType: 'SYSTEM_NOTICE',
              content: this.pendingLabel('CHAT'),
              metadata: { taskStatus: 'RUNNING', action: 'CHAT', aiRunId: createdRun.id },
              aiRunId: createdRun.id,
            },
          });
          return {
            userMessage: createdUserMessage,
            pendingAssistant: createdAssistant,
            run: createdRun,
          };
        },
      ));
    } catch (err: unknown) {
      await this.coachStreams.delete(runId).catch(() => undefined);
      const prismaCode =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code: unknown }).code)
          : undefined;
      if (prismaCode !== 'P2002') throw err;
      const duplicate = await this.prisma.client.aiRun.findUnique({
        where: { clientRequestId: input.clientRequestId },
        include: { triggerMessage: true, assistantMessage: true },
      });
      if (
        duplicate &&
        duplicate.userId === user.userId &&
        duplicate.conversationId === conversationId
      ) {
        return CoachStreamStartResponseSchema.parse({
          streamId: duplicate.id,
          userMessageId: duplicate.triggerMessageId,
          assistantMessageId: duplicate.assistantMessage?.id,
          status: duplicate.status,
        });
      }
      const active = await this.prisma.client.aiRun.findFirst({
        where: { conversationId, taskType: 'COACH_CHAT', status: { in: ['QUEUED', 'RUNNING'] } },
        include: { triggerMessage: true, assistantMessage: true },
      });
      if (active) {
        throw new BizException(
          'COACH_STREAM_ALREADY_RUNNING',
          errorMessagesZhCN.COACH_STREAM_ALREADY_RUNNING,
          409,
          { streamId: active.id },
        );
      }
      throw err;
    }

    await this.maybeSetConversationTitle(conversationId, displayContent, true).catch(
      (err: unknown) => {
        this.logger.warn(`Coach 会话标题更新失败: ${this.toStreamErrorMessage(err)}`);
      },
    );

    const coachAgentEnabled = this.agentConfig.isCoachAgentEnabled();
    const traceSession = this.langfuseCoachTrace.beginCoachChatTrace({
      aiRunId: run.id,
      conversationId,
      userId: user.userId,
      model,
      coachAgent: coachAgentEnabled,
      userInput: latestUserText,
    });

    const abortController = new AbortController();
    this.activeStreams.set(run.id, abortController);
    this.streamPartialText.set(run.id, '');
    this.streamTextSequences.set(run.id, 0);
    this.streamLastSequences.set(run.id, 0);
    this.streamToolTraces.set(run.id, []);
    const timeout = setTimeout(
      () => abortController.abort(new Error('COACH_STREAM_TIMEOUT')),
      Math.max(0, 90_000 - (Date.now() - startedAt)),
    );
    timeout.unref?.();

    let publishQueue = Promise.resolve();
    let lastTextSequence = 0;
    let pendingText = '';
    let firstDeltaSent = false;
    let textFlushTimer: ReturnType<typeof setTimeout> | undefined;
    const queueEvent = (event: string, payload: Record<string, unknown>): Promise<void> => {
      publishQueue = publishQueue.then(async () => {
        const streamEvent = await this.coachStreams.publish(
          run.id,
          event as Parameters<CoachStreamRegistryService['publish']>[1],
          event === 'done' || event === 'cancelled' ? { ...payload, lastTextSequence } : payload,
        );
        if (!streamEvent) return;
        this.streamLastSequences.set(run.id, streamEvent.data.sequence as number);
        if (event === 'delta' && typeof payload.text === 'string') {
          lastTextSequence = streamEvent.data.sequence as number;
          this.streamTextSequences.set(run.id, lastTextSequence);
          this.streamPartialText.set(
            run.id,
            `${this.streamPartialText.get(run.id) ?? ''}${payload.text}`,
          );
        }
        if (event === 'done' || event === 'cancelled' || event === 'error') {
          await this.coachStreams.shortenRetention(run.id);
        }
      });
      this.pendingStreamPublishes.set(run.id, publishQueue);
      void publishQueue.catch(() => undefined);
      return publishQueue;
    };
    const flushText = async (): Promise<void> => {
      if (textFlushTimer) clearTimeout(textFlushTimer);
      textFlushTimer = undefined;
      if (!pendingText) return;
      const text = pendingText;
      pendingText = '';
      await queueEvent('delta', { text });
    };
    this.streamFlushers.set(run.id, flushText);
    const emit: SseEmitFn = async (event, data) => {
      const payload = (data ?? {}) as Record<string, unknown>;
      if (event === 'delta' && typeof payload.text === 'string' && payload.text) {
        pendingText += payload.text;
        if (!firstDeltaSent) {
          firstDeltaSent = true;
          await flushText();
          return;
        }
        if (textFlushTimer) clearTimeout(textFlushTimer);
        textFlushTimer = setTimeout(() => void flushText().catch(() => undefined), 32);
        return;
      }
      if (event === 'done' || event === 'cancelled' || event === 'error') {
        await flushText();
      } else if (pendingText) {
        await flushText();
      }
      await queueEvent(event, payload);
    };

    const runStream = async (): Promise<void> => {
      try {
        const currentRun = await this.prisma.client.aiRun.findUnique({
          where: { id: run.id },
          select: { status: true },
        });
        if (currentRun?.status !== 'RUNNING') return;
        const history = await this.coachChatHistory.load(conversationId, {
          excludeMessageIds: [userMessage.id, pendingAssistant.id],
        });
        const userCtx = await this.userContext.build(user.userId, { timezoneOffsetMinutes });
        const memoryFacts = await this.agentMemory.listForPrompt(user.userId);

        if (coachAgentEnabled) {
          try {
            await this.runCoachAgentStreamPath({
              user,
              conversationId,
              latestUserText,
              rawUserText,
              imageObjectKeys,
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
              traceSession,
              signal: abortController.signal,
              flushBeforeTerminal: async () => {
                await flushText();
                await publishQueue;
              },
            });
            return;
          } catch (agentErr: unknown) {
            if (abortController.signal.aborted) throw agentErr;
            // Tool-loop failures must degrade to plain streaming rather than fail the conversation.
            this.logger.warn(`Coach Agent 降级为纯聊天: ${this.toStreamErrorMessage(agentErr)}`);
          }
        }

        const stream = runCoachChatStream(
          { latestUserText, history, userContext: userCtx, memoryFacts, timezoneOffsetMinutes },
          {
            model,
            client: traceSession?.createTracedDeepSeekClient(),
            signal: abortController.signal,
          },
        );

        let result = await stream.next();
        while (!result.done) {
          await emit('delta', { text: result.value.delta });
          result = await stream.next();
        }

        const finalResult = result.value;
        const suggestedActions = finalResult.suggestedActions ?? [];
        await flushText();
        await publishQueue;

        const persisted = await this.persistCoachChatSuccess({
          pendingAssistantId: pendingAssistant.id,
          userMessageId: userMessage.id,
          runId: run.id,
          conversationId,
          reply: finalResult.reply,
          suggestedActions,
          usage: finalResult.usage,
          startedAt,
          observability: traceSession?.getObservabilityPointer() ?? undefined,
          lastTextSequence: this.streamTextSequences.get(run.id) ?? 0,
          terminalSequence: (this.streamLastSequences.get(run.id) ?? 0) + 1,
        });
        if (!persisted) return;

        traceSession?.complete({ output: finalResult.reply });

        await emit('done', {
          finalText: finalResult.reply,
          suggestedActions,
          toolTrace: [],
          usage: finalResult.usage,
        });
      } catch (err: unknown) {
        await publishQueue.catch(() => undefined);
        if (
          abortController.signal.aborted &&
          abortController.signal.reason instanceof Error &&
          abortController.signal.reason.message === 'USER_CANCELLED'
        ) {
          const partial = this.streamPartialText.get(run.id) ?? '';
          const wasCancelled = await this.persistCoachChatCancellation({
            runId: run.id,
            assistantMessageId: pendingAssistant.id,
            conversationId,
            partial,
            startedAt,
            lastTextSequence: this.streamTextSequences.get(run.id) ?? 0,
            terminalSequence: (this.streamLastSequences.get(run.id) ?? 0) + 1,
            toolTrace: this.streamToolTraces.get(run.id) ?? [],
          });
          if (wasCancelled) {
            traceSession?.complete({ output: partial });
            await emit('cancelled', {
              finalText: partial,
              toolTrace: this.streamToolTraces.get(run.id) ?? [],
            });
          }
          return;
        }
        const message = this.toStreamErrorMessage(err);
        const code =
          err instanceof AiCoreError
            ? err.code
            : err instanceof BizException
              ? err.code
              : undefined;

        traceSession?.fail(message);

        await flushText().catch(() => undefined);
        await publishQueue.catch(() => undefined);

        const failed = await this.persistCoachChatFailure({
          runId: run.id,
          assistantMessageId: pendingAssistant.id,
          message,
          startedAt,
          terminalSequence: (this.streamLastSequences.get(run.id) ?? 0) + 1,
        });
        if (failed) await emit('error', { message, code: code ?? 'COACH_STREAM_FAILED' });
      } finally {
        if (textFlushTimer) clearTimeout(textFlushTimer);
        clearTimeout(timeout);
        this.activeStreams.delete(run.id);
        this.streamPartialText.delete(run.id);
        this.streamToolTraces.delete(run.id);
        this.pendingStreamPublishes.delete(run.id);
        this.streamFlushers.delete(run.id);
        this.streamTextSequences.delete(run.id);
        this.streamLastSequences.delete(run.id);
        void traceSession?.flushAsync();
      }
    };

    void (traceSession ? traceSession.run(runStream) : runStream()).catch((err: unknown) => {
      this.logger.error(`Coach 流后台任务异常: ${this.toStreamErrorMessage(err)}`);
    });

    return CoachStreamStartResponseSchema.parse({
      streamId: run.id,
      userMessageId: userMessage.id,
      assistantMessageId: pendingAssistant.id,
      status: run.status,
    });
  }

  async subscribeMessageStream(
    user: JwtUserPayload,
    conversationId: string,
    streamId: string,
    afterSequence: number,
    write: (event: string, data: unknown) => void,
    isDisconnected: () => boolean,
  ): Promise<void> {
    await this.assertConversationOwner(user.userId, conversationId);
    const findRun = () =>
      this.prisma.client.aiRun.findFirst({
        where: { id: streamId, userId: user.userId, conversationId, taskType: 'COACH_CHAT' },
        include: { assistantMessage: true },
      });
    let run = await findRun();
    if (!run) throw new BizException('NOT_FOUND', '流任务不存在', 404);

    if (run.status === 'RUNNING' && !(await this.coachStreams.hasSequence(streamId))) {
      throw new BizException('COACH_STREAM_EXPIRED', errorMessagesZhCN.COACH_STREAM_EXPIRED, 410);
    }

    let cursor = afterSequence;
    let heartbeatAt = Date.now();
    let statusCheckAt = Date.now();
    while (!isDisconnected()) {
      if (await this.coachStreams.hasEvents(streamId)) {
        const events = await this.coachStreams.readAfter(streamId, cursor);
        for (const item of events) {
          const sequence = Number(item.data.sequence ?? 0);
          if (sequence <= cursor) continue;
          write(item.event, item.data);
          cursor = sequence;
          if (item.event === 'done' || item.event === 'cancelled' || item.event === 'error') return;
        }
      }

      if (Date.now() - statusCheckAt >= 1000) {
        statusCheckAt = Date.now();
        run = await findRun();
        if (!run) return;
        if (run.status !== 'RUNNING') {
          const synthesized = this.buildTerminalStreamEvent(run, cursor + 1);
          write(synthesized.event, synthesized.data);
          return;
        }
      }

      if (Date.now() - heartbeatAt >= 5000) {
        write('ping', {});
        heartbeatAt = Date.now();
      }
      await this.coachStreams.waitForEvents(200);
    }
  }

  async cancelMessageStream(
    user: JwtUserPayload,
    conversationId: string,
    streamId: string,
  ): Promise<{ streamId: string; status: string }> {
    await this.assertConversationOwner(user.userId, conversationId);
    const run = await this.prisma.client.aiRun.findFirst({
      where: { id: streamId, userId: user.userId, conversationId, taskType: 'COACH_CHAT' },
      include: { assistantMessage: true },
    });
    if (!run?.assistantMessage) throw new BizException('NOT_FOUND', '流任务不存在', 404);
    if (run.status !== 'RUNNING') return { streamId, status: run.status };

    this.activeStreams.get(streamId)?.abort(new Error('USER_CANCELLED'));
    await this.streamFlushers
      .get(streamId)?.()
      .catch(() => undefined);
    await this.pendingStreamPublishes.get(streamId)?.catch(() => undefined);
    const partial = this.streamPartialText.get(streamId) ?? '';
    const cancelled = await this.persistCoachChatCancellation({
      runId: streamId,
      assistantMessageId: run.assistantMessage.id,
      conversationId,
      partial,
      startedAt: run.createdAt.getTime(),
      lastTextSequence: this.streamTextSequences.get(streamId) ?? 0,
      terminalSequence: (this.streamLastSequences.get(streamId) ?? 0) + 1,
      toolTrace: this.streamToolTraces.get(streamId) ?? [],
    });
    if (cancelled) {
      try {
        await this.coachStreams.publish(streamId, 'cancelled', {
          lastTextSequence: this.streamTextSequences.get(streamId) ?? 0,
          finalText: partial,
          toolTrace: this.streamToolTraces.get(streamId) ?? [],
        });
        await this.coachStreams.shortenRetention(streamId);
      } catch (err: unknown) {
        this.logger.warn(`Coach 取消终态暂未写入 Redis: ${this.toStreamErrorMessage(err)}`);
      }
      return { streamId, status: 'CANCELLED' };
    }
    const current = await this.prisma.client.aiRun.findUnique({ where: { id: streamId } });
    return { streamId, status: current?.status ?? 'FAILED' };
  }

  private buildTerminalStreamEvent(
    run: {
      status: string;
      errorMsg: string | null;
      outputJson: unknown;
      assistantMessage: { content: string; contentType: string; metadata: unknown } | null;
    },
    sequence: number,
  ): { event: 'done' | 'cancelled' | 'error'; data: Record<string, unknown> } {
    if (run.status === 'DONE') {
      const output = (run.outputJson ?? {}) as {
        reply?: string;
        suggestedActions?: unknown;
        toolTrace?: unknown;
        usage?: unknown;
        lastTextSequence?: number;
        terminalSequence?: number;
      };
      return {
        event: 'done',
        data: {
          sequence: Math.max(sequence, Number(output.terminalSequence ?? 0)),
          lastTextSequence: Number(output.lastTextSequence ?? 0),
          finalText: run.assistantMessage?.content ?? output.reply ?? '',
          suggestedActions: output.suggestedActions ?? [],
          toolTrace: output.toolTrace ?? [],
          usage: output.usage,
        },
      };
    }
    if (run.status === 'CANCELLED') {
      const output = (run.outputJson ?? {}) as {
        lastTextSequence?: number;
        terminalSequence?: number;
        toolTrace?: unknown;
      };
      return {
        event: 'cancelled',
        data: {
          sequence: Math.max(sequence, Number(output.terminalSequence ?? 0)),
          lastTextSequence: Number(output.lastTextSequence ?? 0),
          finalText:
            run.assistantMessage?.contentType === 'TEXT' ? run.assistantMessage.content : '',
          toolTrace: output.toolTrace ?? [],
        },
      };
    }
    return {
      event: 'error',
      data: {
        sequence: Math.max(
          sequence,
          Number(((run.outputJson ?? {}) as { terminalSequence?: number }).terminalSequence ?? 0),
        ),
        code: 'COACH_STREAM_FAILED',
        message: run.errorMsg ?? '回答生成失败，请重试',
      },
    };
  }

  private async persistCoachChatCancellation(params: {
    runId: string;
    assistantMessageId: string;
    conversationId: string;
    partial: string;
    startedAt: number;
    lastTextSequence?: number;
    terminalSequence?: number;
    toolTrace?: CoachToolTraceItem[];
  }): Promise<boolean> {
    return this.prisma.client.$transaction(async (tx) => {
      const transitioned = await tx.aiRun.updateMany({
        where: { id: params.runId, status: 'RUNNING' },
        data: {
          status: 'CANCELLED',
          outputJson: {
            reply: params.partial,
            lastTextSequence: params.lastTextSequence ?? 0,
            terminalSequence: params.terminalSequence ?? 1,
            toolTrace: params.toolTrace ?? [],
          } as Prisma.InputJsonValue,
          durationMs: Date.now() - params.startedAt,
        },
      });
      if (transitioned.count === 0) return false;
      await tx.message.update({
        where: { id: params.assistantMessageId },
        data: {
          contentType: params.partial ? 'TEXT' : 'SYSTEM_NOTICE',
          content: params.partial || '已停止生成',
          metadata: {
            taskStatus: 'CANCELLED',
            taskType: 'COACH_CHAT',
            ...(params.toolTrace?.length ? { toolTrace: params.toolTrace } : {}),
            ...(params.partial ? { incomplete: true } : {}),
          } as Prisma.InputJsonValue,
        },
      });
      await tx.conversation.update({
        where: { id: params.conversationId },
        data: { updatedAt: new Date() },
      });
      return true;
    });
  }

  private async persistCoachChatFailure(params: {
    runId: string;
    assistantMessageId: string;
    message: string;
    startedAt: number;
    terminalSequence: number;
  }): Promise<boolean> {
    return this.prisma.client.$transaction(async (tx) => {
      const transitioned = await tx.aiRun.updateMany({
        where: { id: params.runId, status: 'RUNNING' },
        data: {
          status: 'FAILED',
          errorMsg: params.message,
          outputJson: { terminalSequence: params.terminalSequence } as Prisma.InputJsonValue,
          durationMs: Date.now() - params.startedAt,
        },
      });
      if (transitioned.count === 0) return false;
      await tx.message.update({
        where: { id: params.assistantMessageId },
        data: {
          contentType: 'SYSTEM_NOTICE',
          content: params.message,
          metadata: { taskStatus: 'FAILED', taskType: 'COACH_CHAT' } as Prisma.InputJsonValue,
        },
      });
      return true;
    });
  }

  private async runCoachAgentStreamPath(params: {
    user: JwtUserPayload;
    conversationId: string;
    latestUserText: string;
    rawUserText?: string;
    imageObjectKeys?: string[];
    history: CoachChatHistoryItem[];
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
    traceSession?: CoachChatTraceSession | null;
    signal: AbortSignal;
    flushBeforeTerminal: () => Promise<void>;
  }): Promise<void> {
    const agentClient = params.traceSession?.createTracedDeepSeekClient({
      stream: 'coach-agent-final-stream',
      json: 'coach-infer-suggested-actions',
      react: 'coach-agent-react',
    });

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
        triggerMessageId: params.userMessageId,
      },
      { model: params.model, client: agentClient, signal: params.signal },
    );

    let finalReply = '';
    let suggestedActions: CoachChatOutput['suggestedActions'] = [];
    let usage = { tokenIn: 0, tokenOut: 0, costCny: 0 };
    let toolTrace: CoachToolTraceItem[] = [];
    let lastVisibleText = '';

    for await (const event of runner) {
      if (event.type === 'delta') {
        finalReply = event.text;
        if (event.text.startsWith(lastVisibleText)) {
          const appended = event.text.slice(lastVisibleText.length);
          if (appended) await params.emit('delta', { text: appended });
          lastVisibleText = event.text;
        }
      } else if (event.type === 'tool_start') {
        await params.emit('tool_start', { name: event.name, label: event.label });
      } else if (event.type === 'tool_end') {
        const traces = this.streamToolTraces.get(params.runId) ?? [];
        traces.push({
          name: event.name,
          outputSummary: event.summary?.slice(0, 512),
          durationMs: 0,
          ok: event.ok,
        });
        this.streamToolTraces.set(params.runId, traces);
        await params.emit('tool_end', { name: event.name, ok: event.ok, summary: event.summary });
      } else if (event.type === 'done') {
        finalReply = event.reply;
        suggestedActions = event.suggestedActions ?? [];
        usage = event.usage;
        toolTrace = event.toolTrace;
        this.streamToolTraces.set(params.runId, toolTrace);
      }
    }

    await params.flushBeforeTerminal();
    const persisted = await this.persistCoachChatSuccess({
      pendingAssistantId: params.pendingAssistantId,
      userMessageId: params.userMessageId,
      runId: params.runId,
      conversationId: params.conversationId,
      reply: finalReply,
      suggestedActions,
      usage,
      startedAt: params.startedAt,
      toolTrace,
      observability: params.traceSession?.getObservabilityPointer() ?? undefined,
      lastTextSequence: this.streamTextSequences.get(params.runId) ?? 0,
      terminalSequence: (this.streamLastSequences.get(params.runId) ?? 0) + 1,
    });
    if (!persisted) return;

    params.traceSession?.complete({ output: finalReply });

    await params.emit('done', {
      finalText: finalReply,
      suggestedActions,
      toolTrace,
      usage,
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
    observability?: CoachChatObservability;
    lastTextSequence?: number;
    terminalSequence?: number;
  }): Promise<boolean> {
    return this.prisma.client.$transaction(async (tx) => {
      const transitioned = await tx.aiRun.updateMany({
        where: { id: params.runId, status: 'RUNNING' },
        data: {
          status: 'DONE',
          outputJson: {
            reply: params.reply,
            suggestedActions: params.suggestedActions,
            ...(params.toolTrace?.length ? { toolTrace: params.toolTrace } : {}),
            ...(params.observability ? { observability: params.observability } : {}),
            usage: params.usage,
            lastTextSequence: params.lastTextSequence ?? 0,
            terminalSequence: params.terminalSequence ?? 1,
          } as Prisma.InputJsonValue,
          tokenIn: params.usage.tokenIn,
          tokenOut: params.usage.tokenOut,
          costCny: params.usage.costCny,
          durationMs: Date.now() - params.startedAt,
        },
      });
      if (transitioned.count === 0) return false;
      await tx.message.update({
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
      await tx.conversation.update({
        where: { id: params.conversationId },
        data: { updatedAt: new Date() },
      });
      return true;
    });
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
        content: `已记录 ${created.totalKcal} kcal`,
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
        model: LLM_MODELS.DEEPSEEK_V4_FLASH,
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
}
