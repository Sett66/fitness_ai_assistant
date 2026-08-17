# SOCIAL-03 — 评论：单层平铺 + 帖子详情页

| 字段           | 值                          |
| -------------- | --------------------------- |
| **Type**       | AFK                         |
| **Blocked by** | [SOCIAL-01](./SOCIAL-01.md) |
| **Blocks**     | SOCIAL-07                   |
| **估时**       | 1.5–2 天                    |
| **状态**       | ✅ 已完成                   |

---

## 1. 目标

帖子详情页可以查看和发表评论。评论**单层平铺**按时间升序分页，`parentId` 仅用于渲染「回复 @某某」前缀；作者可软删自己的评论，`Post.commentCount` 在事务内维护。

**本切片不做**：楼中楼折叠、评论点赞、@ 提及的用户检索与跳转、被评论通知。

---

## 2. 背景 / 可复用基建

- `Comment` 模型已存在（含 `parentId` 自关联），`deletedAt` 由 SOCIAL-01 补齐
- `Post.commentCount` 列由 SOCIAL-01 建好，当前恒为 0
- `PostDetailScreen` 由 SOCIAL-01 建好，当前只渲染正文与图片，本切片补评论区
- 作者信息的组装（`SocialAuthorSchema` + 头像预签名 + `displayName` fallback）在 `posts.service.ts` 的 `mapPosts` 里已有实现，**抽成可复用的 `resolveAuthors(userIds)`** 供评论复用

---

## 3. 前置阅读

1. [ADR 0011](../../adr/0011-social-feed-and-search.md) §5、§6、§7
2. [SOCIAL-01](./SOCIAL-01.md) §4.2、§4.5
3. [SOCIAL-02](./SOCIAL-02.md) §4.2（事务内维护计数的写法，评论沿用同一纪律）
4. `apps/api/src/modules/conversations/conversations.service.ts` 209–230 行（时间序 cursor 分页的另一种范式）

---

## 4. 详细规格

### 4.1 共享 Zod（`packages/shared/src/schemas/phase2/social.ts`）

```ts
CommentSummarySchema = {
  id: IdSchema,
  postId: IdSchema,
  author: SocialAuthorSchema,
  body: z.string(),
  parentId: IdSchema.nullable(),
  replyToName: z.string().nullable(), // 父评论作者昵称，渲染「回复 @xxx」；父评论已删则为 null
  isMine: z.boolean(),
  createdAt: DateTimeSchema,
};
CommentListResponseSchema = paginatedSchema(CommentSummarySchema);

CreateCommentRequestSchema = {
  body: z.string().trim().min(1).max(1000),
  parentId: IdSchema.optional(),
};
CreateCommentResponseSchema = CommentSummarySchema;
```

错误码追加 `'SOCIAL_COMMENT_NOT_FOUND'`（`packages/shared/src/errors/codes.ts` + i18n 文案「评论不存在或已删除」）。

### 4.2 `GET /v1/social/posts/:id/comments`

- 先校验帖子对当前用户可见（复用 SOCIAL-01 的 `assertVisiblePost`）
- 查询：

```ts
where: { postId, deletedAt: null }
orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]   // 升序：评论按发表顺序读
take: limit + 1
...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
```

- `replyToName` 的解析：收集本页所有非空 `parentId` → 一次 `comment.findMany({ where: { id: { in } }, select: { id: true, userId: true } })` → 与 `resolveAuthors` 的结果合并取昵称。父评论已软删或跨页不影响本页渲染，取不到就填 `null`
- 作者信息走 `resolveAuthors(userIds)`，整页常数条 SQL

### 4.3 `POST /v1/social/posts/:id/comments`

```ts
await this.prisma.client.$transaction(async (tx) => {
  const created = await tx.comment.create({ data: { postId, userId, body, parentId } });
  await tx.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });
  return created;
});
```

要点：

- 发表前校验帖子可见；`parentId` 若传入，必须校验该评论**属于同一帖子且未软删**，否则 `SOCIAL_COMMENT_NOT_FOUND` 404
- 关键词校验是 SOCIAL-06 的插入点，本切片留注释标注位置
- 评论**不进检索索引**（ADR 0011 §9 只索引帖子正文与用户昵称）

### 4.4 `DELETE /v1/social/comments/:id`

```ts
const result = await tx.comment.updateMany({
  where: { id, userId, deletedAt: null },
  data: { deletedAt: new Date() },
});
if (result.count === 1) {
  await tx.post.update({ where: { id: postId }, data: { commentCount: { decrement: 1 } } });
}
```

`count === 0` 抛 404。**只有真的软删成功才 decrement**（ADR 0011 §5 的纪律，与点赞同构）。返回 204。

> 帖子被软删时**不**级联处理其评论：评论查询恒带 `postId` 且入口是帖子详情，删帖后评论自然不可达。避免一次删帖引发大批量写入。

### 4.5 移动端

- **`PostDetailScreen` 补评论区**：顶部为帖子卡片，下方 `useInfiniteQuery` 评论列表，底部固定 `CommentComposer` 输入条（`KeyboardAvoidingView`）
- **`CommentItem` 组件**：头像 + 昵称 + `replyToName` 存在时前缀「回复 @xxx」+ 正文 + 相对时间；`isMine` 时长按弹删除确认
- **回复**：点击某条评论的「回复」按钮，把 `parentId` 与被回复者昵称存进本地 state，输入框顶部显示「回复 @xxx ×」，发送后清空
- **发表成功后**：`invalidateQueries(socialComments(postId))` + 手动把 `socialPost(postId)` 缓存里的 `commentCount` 加一（避免整页 refetch）
- **queryKeys**：`socialComments: (postId: string) => ['social-comments', postId] as const`
- hooks：`usePostComments(postId)` / `useCreateComment(postId)` / `useDeleteComment()`

---

## 5. 建议改动文件

| 路径                                                                                 | 动作                                  |
| ------------------------------------------------------------------------------------ | ------------------------------------- |
| `packages/shared/src/schemas/phase2/social.ts`                                       | 评论请求 / 响应 schema                |
| `packages/shared/src/errors/codes.ts` + `i18n/zh-CN.ts`                              | `SOCIAL_COMMENT_NOT_FOUND`            |
| `apps/api/src/modules/social/comments.controller.ts`                                 | 新建（3 个端点）                      |
| `apps/api/src/modules/social/comments.service.ts`                                    | 新建                                  |
| `apps/api/src/modules/social/posts.service.ts`                                       | 抽出 `resolveAuthors(userIds)` 供复用 |
| `apps/api/src/modules/social/social.module.ts`                                       | 注册 controller / service             |
| `apps/mobile/src/features/social/PostDetailScreen.tsx`                               | 补评论区                              |
| `apps/mobile/src/features/social/components/CommentItem.tsx` / `CommentComposer.tsx` | 新建                                  |
| `apps/mobile/src/api/endpoints/social.ts`                                            | 评论 hooks                            |
| `apps/mobile/src/api/queryKeys.ts`                                                   | `socialComments`                      |

---

## 6. Acceptance criteria

- [x] `pnpm typecheck` 全仓通过
- [x] 发表评论后 `Post.commentCount` +1，软删后 −1；重复调用 `DELETE` 不会把计数减成负数
- [x] 评论列表按时间**升序**分页，翻页无重复无遗漏
- [x] 传入他帖的 `parentId` 返回 404 `SOCIAL_COMMENT_NOT_FOUND`
- [x] 带 `parentId` 的评论正确渲染「回复 @xxx」；父评论被删后该条仍能正常显示（前缀消失而非报错）
- [x] 软删的评论不出现在列表，且不计入 `commentCount`
- [x] 评论列表整页只发常数条 SQL（评论 + 父评论 + 作者）
- [x] 移动端：详情页可发评论、可回复、可删除自己的评论，键盘不遮挡输入条（Android 真机 / 模拟器）

---

## 7. 验证步骤

```powershell
pnpm --filter shared build
pnpm typecheck
pnpm --filter api test -- src/modules/social/comments.spec.ts
pnpm --filter api start:api
# 手测：发帖 → 评论 3 条 → 回复其中 1 条 → 删除 1 条 → 核对 commentCount 为 3
.\scripts\social-03-smoke.ps1
pnpm --filter mobile start
```

---

## 8. 不做

- 楼中楼 / 「查看全部 N 条回复」
- 评论点赞、评论排序（热度）
- @ 提及的用户检索、点击跳转用户主页
- 被评论通知

---

## 9. 交付物 / 下游

| 交付物                         | 消费者                                  |
| ------------------------------ | --------------------------------------- |
| 评论接口 + `commentCount` 维护 | SOCIAL-07（验收脚本核对计数）           |
| `resolveAuthors(userIds)`      | SOCIAL-05（搜索结果与用户主页复用）     |
| `PostDetailScreen` 完整形态    | SOCIAL-05（搜索结果点击进入同一详情页） |
