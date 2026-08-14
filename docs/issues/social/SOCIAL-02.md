# SOCIAL-02 — 点赞：幂等接口 + 事务计数

| 字段           | 值                          |
| -------------- | --------------------------- |
| **Type**       | AFK                         |
| **Blocked by** | [SOCIAL-01](./SOCIAL-01.md) |
| **Blocks**     | SOCIAL-07                   |
| **估时**       | 1 天                        |
| **状态**       | ⬜ 未开工                   |

---

## 1. 目标

给帖子加上点赞：一对**幂等**的 `PUT` / `DELETE` 接口，`Post.likeCount` 在事务内维护并保证不漂移，feed 与详情页返回 `likedByMe`，移动端心形按钮带乐观更新。

**本切片不做**：多表情（ADR 0011 §4 只做 `LIKE`）、点赞者列表页、被赞通知。

---

## 2. 背景 / 可复用基建

- `Reaction` 模型已存在，主键 `@@id([postId, userId])`——**一个用户对一帖只能有一条记录**，这正是幂等实现的依据
- `Post.likeCount` 列由 SOCIAL-01 建好，当前恒为 0
- `PostSummarySchema.likedByMe` 字段已存在，当前恒 `false`，本切片接管
- `mapPosts(rows, viewerId)` 私有方法由 SOCIAL-01 提供，本切片在其中补 `likedByMe`

---

## 3. 前置阅读

1. [ADR 0011](../../adr/0011-social-feed-and-search.md) §4、§5（**两条计数纪律是本切片的核心**）
2. [SOCIAL-01](./SOCIAL-01.md) §4.5（`mapPosts` 的组装流程）
3. `packages/db/prisma/schema.prisma` 的 `Reaction`
4. Prisma 错误码文档：`P2002`（唯一约束冲突）

---

## 4. 详细规格

### 4.1 共享 Zod（`packages/shared/src/schemas/phase2/social.ts`）

```ts
LikeResponseSchema = {
  postId: IdSchema,
  likeCount: z.number().int().nonnegative(),
  likedByMe: z.boolean(),
};
```

请求无 body（`kind` 固定 `LIKE`，不由客户端指定）。

### 4.2 `PUT /v1/social/posts/:id/like`

**必须**按下面的顺序实现，任何「先查再加」的写法都会在并发下漏计或重复计：

```ts
async like(userId: string, postId: string): Promise<LikeResponse> {
  const post = await this.assertVisiblePost(userId, postId);   // 404 SOCIAL_POST_NOT_FOUND

  const updated = await this.prisma.client.$transaction(async (tx) => {
    try {
      await tx.reaction.create({ data: { postId, userId, kind: 'LIKE' } });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // 已点过赞：幂等返回，绝不 increment
        return tx.post.findUniqueOrThrow({ where: { id: postId }, select: { likeCount: true } });
      }
      throw err;
    }
    return tx.post.update({
      where: { id: postId },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
  });

  return { postId, likeCount: updated.likeCount, likedByMe: true };
}
```

`isUniqueViolation` 判定 `err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'`，放在模块内的小工具函数里。

### 4.3 `DELETE /v1/social/posts/:id/like`

对称实现，判据是 `deleteMany` 的返回值：

```ts
const removed = await tx.reaction.deleteMany({ where: { postId, userId } });
if (removed.count === 0) {
  // 本来就没点赞：幂等返回，绝不 decrement
  return tx.post.findUniqueOrThrow({ ... });
}
return tx.post.update({ where: { id: postId }, data: { likeCount: { decrement: 1 } }, ... });
```

返回 `{ postId, likeCount, likedByMe: false }`。

> `likeCount` 有 `@default(0)` 但没有 DB 层 CHECK 约束；上面的写法保证不会减到负数。若要更保险，可在 `decrement` 时加 `where: { id: postId, likeCount: { gt: 0 } }`，但那会让计数漂移**静默**发生，本切片不采用——宁可让错误显形。

### 4.4 `likedByMe` 的批量查询

在 `mapPosts(rows, viewerId)` 中补**一次**查询，不得逐帖查：

```ts
const likedIds = new Set(
  (
    await this.prisma.client.reaction.findMany({
      where: { postId: { in: rows.map((r) => r.id) }, userId: viewerId },
      select: { postId: true },
    })
  ).map((r) => r.postId),
);
```

即整页仍是常数条 SQL（帖子 + 用户 + 媒体 + 点赞 = 4 条）。

### 4.5 移动端

- **`LikeButton` 组件**（`features/social/components/`）：心形图标 + 计数，已赞态填充色
- **乐观更新**：`useMutation` 的 `onMutate` 里直接改 TanStack Query 缓存（feed 的 infinite data 与 `socialPost(id)` 两处），`onError` 回滚，`onSettled` 不做全量 invalidate（会导致整个 feed 抖动），仅在详情页 refetch 单帖
- **连点保护**：按钮在 mutation pending 时禁用；即使漏点两次，服务端幂等也不会算错
- hooks：`useLikePost()` / `useUnlikePost()`

---

## 5. 建议改动文件

| 路径                                                        | 动作                                              |
| ----------------------------------------------------------- | ------------------------------------------------- |
| `packages/shared/src/schemas/phase2/social.ts`              | `LikeResponseSchema`                              |
| `apps/api/src/modules/social/posts.controller.ts`           | `PUT` / `DELETE` `:id/like`                       |
| `apps/api/src/modules/social/posts.service.ts`              | `like()` / `unlike()` + `mapPosts` 补 `likedByMe` |
| `apps/api/src/modules/social/reactions.spec.ts`             | 幂等单测（见 §6）                                 |
| `apps/mobile/src/features/social/components/LikeButton.tsx` | 新建                                              |
| `apps/mobile/src/api/endpoints/social.ts`                   | `useLikePost` / `useUnlikePost`                   |

---

## 6. Acceptance criteria

- [ ] `pnpm typecheck` 全仓通过
- [ ] `PUT /like` 连续调用 3 次，`likeCount` 恒为 1（幂等）
- [ ] `DELETE /like` 连续调用 3 次，`likeCount` 恒为 0 且不出现负数
- [ ] 两个不同用户各点一次，`likeCount` 为 2
- [ ] feed 与详情的 `likedByMe` 对当前用户正确；整页仍只发常数条 SQL
- [ ] 至少 1 个单测覆盖「`P2002` 分支不 increment」——可对 service 注入 mock `PrismaService`，或用 `$transaction` 的假实现断言 `post.update` 未被调用
- [ ] 移动端：点赞即时变色与计数 +1，断网时回滚，重连后与服务端一致

---

## 7. 验证步骤

```powershell
pnpm typecheck
pnpm --filter api start:api
# 幂等手测（PowerShell，替换 $token / $postId）
1..3 | ForEach-Object { Invoke-RestMethod -Method Put -Uri "http://localhost:3000/v1/social/posts/$postId/like" -Headers @{ Authorization = "Bearer $token" } }
```

---

## 8. 不做

- 多表情（FIRE / CLAP / HEART）
- 点赞者列表 / 「谁赞了我」
- 被赞通知（ADR 0011 §1：通知不在本 Epic）
- 按赞数排序的热门 feed

---

## 9. 交付物 / 下游

| 交付物                          | 消费者                                  |
| ------------------------------- | --------------------------------------- |
| 幂等点赞接口 + `likeCount` 维护 | SOCIAL-07（验收脚本核对计数）           |
| `LikeButton` + 乐观更新范式     | SOCIAL-03（评论区复用同一乐观更新写法） |
| `P2002` 幂等判定工具函数        | 未来任何「唯一约束 + 冗余计数」场景     |
