import { Injectable } from '@nestjs/common';

import { PrismaService } from '../infra/prisma/prisma.service';
import { ConversationSideEffectService } from './conversation-side-effect.service';

export type CoachChatHistoryItem = {
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: Date;
};

/** 工作记忆窗口：ADR 0008 §3 */
const HISTORY_TAKE = 12;
const MAX_HISTORY_CONTENT_LENGTH = 2000;

function formatCoachHistoryContent(
  contentType: string,
  content: string,
  metadata: unknown,
): string {
  if (contentType === 'PLAN_CARD') {
    const meta = (metadata ?? {}) as Record<string, unknown>;
    const label = meta.planType === 'WORKOUT' ? '训练' : '饮食';
    return `[${label}计划已生成完成]`;
  }
  if (contentType === 'MEAL_VISION_CARD') {
    return '[餐食识别已完成，待用户确认]';
  }
  if (contentType === 'IMAGE') {
    const meta = (metadata ?? {}) as Record<string, unknown>;
    const count = Array.isArray(meta.imageObjectKeys) ? meta.imageObjectKeys.length : 0;
    const suffix = count > 0 ? `（附${count}张图）` : '';
    return `${content}${suffix}`.slice(0, MAX_HISTORY_CONTENT_LENGTH);
  }
  return content.slice(0, MAX_HISTORY_CONTENT_LENGTH);
}

/** COACH_CHAT 工作记忆加载：流式（ConversationsService）与非流式（AiTaskProcessor）共用同一口径 */
@Injectable()
export class CoachChatHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversationSideEffects: ConversationSideEffectService,
  ) {}

  async load(
    conversationId: string | null,
    options?: { excludeMessageIds?: (string | null | undefined)[] },
  ): Promise<CoachChatHistoryItem[]> {
    if (!conversationId) {
      return [];
    }

    await this.conversationSideEffects.reconcileStaleAssistantMessages(conversationId);

    const excludeIds = [...new Set((options?.excludeMessageIds ?? []).filter(Boolean))] as string[];

    const historyRows = await this.prisma.client.message.findMany({
      where: {
        conversationId,
        role: { in: ['USER', 'ASSISTANT'] },
        contentType: { in: ['TEXT', 'IMAGE', 'PLAN_CARD', 'MEAL_VISION_CARD'] },
        ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_TAKE,
    });

    return historyRows
      .reverse()
      .filter((row) => row.content && row.content !== '思考中…')
      .filter((row) => {
        const meta = (row.metadata ?? {}) as Record<string, unknown>;
        return meta.taskStatus !== 'RUNNING';
      })
      .map((row) => ({
        role: row.role as 'USER' | 'ASSISTANT',
        content: formatCoachHistoryContent(row.contentType, row.content, row.metadata),
        createdAt: row.createdAt,
      }));
  }
}
