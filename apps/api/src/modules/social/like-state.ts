import type { PrismaClient } from '@fitness/db';
import type { LikeWriteResponse } from '@fitness/shared';

type Target = { kind: 'post' | 'comment'; id: string };

/** 同一用户/目标的读写共用行锁；版本、关系和计数在同一事务中提交。 */
export async function accessLikeState(
  prisma: PrismaClient,
  userId: string,
  target: Target,
  write?: { expectedRevision: number; likedByMe: boolean },
): Promise<LikeWriteResponse> {
  const targetKey = `${target.kind}:${target.id}`;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "SocialLikeRevision" ("userId", "targetKey", "revision")
      VALUES (${userId}, ${targetKey}, 0)
      ON CONFLICT ("userId", "targetKey") DO NOTHING
    `;
    const [row] = await tx.$queryRaw<Array<{ revision: number }>>`
      SELECT "revision" FROM "SocialLikeRevision"
      WHERE "userId" = ${userId} AND "targetKey" = ${targetKey} FOR UPDATE
    `;
    if (!row) throw new Error('Like revision row missing');
    let revision = row.revision;
    const applied = write !== undefined && write.expectedRevision === revision;
    if (applied) {
      const delta = write.likedByMe
        ? target.kind === 'post'
          ? (
              await tx.reaction.createMany({
                data: [{ userId, postId: target.id, kind: 'LIKE' }],
                skipDuplicates: true,
              })
            ).count
          : (
              await tx.commentReaction.createMany({
                data: [{ userId, commentId: target.id }],
                skipDuplicates: true,
              })
            ).count
        : target.kind === 'post'
          ? -(await tx.reaction.deleteMany({ where: { userId, postId: target.id } })).count
          : -(await tx.commentReaction.deleteMany({ where: { userId, commentId: target.id } }))
              .count;
      if (delta !== 0) {
        const args = { where: { id: target.id }, data: { likeCount: { increment: delta } } };
        if (target.kind === 'post') await tx.post.update(args);
        else await tx.comment.update(args);
      }
      await tx.$executeRaw`
        UPDATE "SocialLikeRevision" SET "revision" = "revision" + 1
        WHERE "userId" = ${userId} AND "targetKey" = ${targetKey}
      `;
      revision += 1;
    }
    const reaction =
      target.kind === 'post'
        ? await tx.reaction.findUnique({ where: { postId_userId: { postId: target.id, userId } } })
        : await tx.commentReaction.findUnique({
            where: { commentId_userId: { commentId: target.id, userId } },
          });
    const args = { where: { id: target.id }, select: { likeCount: true } } as const;
    const entity =
      target.kind === 'post'
        ? await tx.post.findUniqueOrThrow(args)
        : await tx.comment.findUniqueOrThrow(args);
    return { revision, likedByMe: reaction !== null, likeCount: entity.likeCount, applied };
  });
}
