import type { PrismaClient } from '@fitness/db';
import { LikeWriteRequestSchema } from '@fitness/shared';
import { accessLikeState } from './like-state';

/** 保留实际事务函数和条件写入逻辑，用内存事务替代数据库 IO。 */
function fixture() {
  let revision = 0;
  let liked = false;
  let likeCount = 0;
  const reaction = {
    createMany: jest.fn(async () => {
      if (liked) return { count: 0 };
      liked = true;
      return { count: 1 };
    }),
    deleteMany: jest.fn(async () => {
      const count = Number(liked);
      liked = false;
      return { count };
    }),
    findUnique: jest.fn(async () => (liked ? {} : null)),
  };
  const entity = {
    update: jest.fn(async (args: { data: { likeCount: { increment: number } } }) => {
      likeCount += args.data.likeCount.increment;
      return { likeCount };
    }),
    findUniqueOrThrow: jest.fn(async () => ({ likeCount })),
  };
  const tx = {
    $executeRaw: jest.fn(async (sql: TemplateStringsArray) => {
      if (sql.join('').includes('UPDATE')) revision += 1;
      return 1;
    }),
    $queryRaw: jest.fn(async () => [{ revision }]),
    reaction,
    commentReaction: reaction,
    post: entity,
    comment: entity,
  };
  const client = {
    $transaction: jest.fn(async (run: (tx: unknown) => Promise<unknown>) => {
      const snapshot = { revision, liked, likeCount };
      try {
        return await run(tx);
      } catch (error) {
        ({ revision, liked, likeCount } = snapshot);
        throw error;
      }
    }),
  } as unknown as PrismaClient;
  return { client, tx, state: () => ({ revision, likedByMe: liked, likeCount }) };
}

describe.each(['post', 'comment'] as const)('%s 条件点赞', (kind) => {
  const target = { kind, id: 'target-xxxxxxxx' };
  it('后发的取消先提交，迟到的旧点赞不能覆盖（取消也保留版本）', async () => {
    const { client, tx, state } = fixture();
    const cancel = await accessLikeState(client, 'u', target, {
      expectedRevision: 0,
      likedByMe: false,
    });
    const late = await accessLikeState(client, 'u', target, {
      expectedRevision: 0,
      likedByMe: true,
    });
    expect(cancel).toEqual({ revision: 1, likedByMe: false, likeCount: 0, applied: true });
    expect(late).toEqual({ ...cancel, applied: false });
    expect(state().likedByMe).toBe(false);
    expect(tx.reaction.createMany).not.toHaveBeenCalled();
    expect(tx.$queryRaw.mock.calls.length).toBe(2);
  });

  it('旧点赞先提交，最新取消遇冲突后以新版本重试', async () => {
    const { client, state } = fixture();
    await accessLikeState(client, 'u', target, { expectedRevision: 0, likedByMe: true });
    const conflict = await accessLikeState(client, 'u', target, {
      expectedRevision: 0,
      likedByMe: false,
    });
    expect(conflict.applied).toBe(false);
    await accessLikeState(client, 'u', target, {
      expectedRevision: conflict.revision,
      likedByMe: false,
    });
    expect(state()).toEqual({ revision: 2, likedByMe: false, likeCount: 0 });
  });

  it('重复请求不重复计数，同态新意图仍推进版本', async () => {
    const { client, state } = fixture();
    await accessLikeState(client, 'u', target, { expectedRevision: 0, likedByMe: true });
    await accessLikeState(client, 'u', target, { expectedRevision: 0, likedByMe: true });
    await accessLikeState(client, 'u', target, { expectedRevision: 1, likedByMe: true });
    expect(state()).toEqual({ revision: 2, likedByMe: true, likeCount: 1 });
  });

  it('计数失败会整体回滚，不提前推进版本；读取不推进版本', async () => {
    const { client, tx, state } = fixture();
    tx.post.update.mockRejectedValueOnce(new Error('db failed'));
    await expect(
      accessLikeState(client, 'u', target, { expectedRevision: 0, likedByMe: true }),
    ).rejects.toThrow('db failed');
    expect(state()).toEqual({ revision: 0, likedByMe: false, likeCount: 0 });
    expect(await accessLikeState(client, 'u', target)).toEqual({ ...state(), applied: false });
  });
});

it('拒绝缺版本的旧客户端写入，避免绕过条件更新', () => {
  for (const input of [undefined, {}, { expectedRevision: -1 }, { expectedRevision: 0.5 }]) {
    expect(LikeWriteRequestSchema.safeParse(input).success).toBe(false);
  }
});
