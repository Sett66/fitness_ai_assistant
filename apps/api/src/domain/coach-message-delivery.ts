import type { Prisma } from '@fitness/db';
import { COACH_MESSAGE_DELIVERY_FAILED } from '@fitness/shared';

/** 回复失败时把触发它的用户消息标为 FAILED：不进入工作记忆，且仅在仍为最后一条时可重试 */
export async function markUserMessageDeliveryFailed(
  tx: Prisma.TransactionClient,
  userMessageId: string | null | undefined,
): Promise<void> {
  if (!userMessageId) return;
  const current = await tx.message.findUnique({
    where: { id: userMessageId },
    select: { role: true, metadata: true },
  });
  if (!current || current.role !== 'USER') return;
  await tx.message.update({
    where: { id: userMessageId },
    data: {
      metadata: {
        ...((current.metadata ?? {}) as Record<string, unknown>),
        deliveryStatus: COACH_MESSAGE_DELIVERY_FAILED,
      } as Prisma.InputJsonValue,
    },
  });
}
