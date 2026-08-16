# SOCIAL-01 — 发帖 + 广场 Feed 最小闭环

| 字段           | 值                    |
| -------------- | --------------------- |
| **Type**       | AFK                   |
| **Blocked by** | ADR 0011（Accepted）  |
| **Blocks**     | SOCIAL-02、03、04、06 |
| **估时**       | 3–4 天                |
| **状态**       | ✅ 已完成             |

---

## 1. 目标

打通社区的**端到端骨架**：用户在「社区」Tab 看到全站公开帖的时间倒序列表，可以发一条带图文字帖，可以删除自己的帖子。

本切片同时承担 **整个 Epic 的唯一一次 migration**（ADR 0011 §17）——`moderation` 等列在此建好，即使要到 SOCIAL-06 才被使用。

**本切片不做**：点赞（02）、评论（03）、搜索与索引（04/05）、LLM 审核（06）、seed（07）。计数列建好后恒为 0，`moderation` 恒为 `PENDING`。

---

## 2. 背景 / 可复用基建

- **模型已存在**：`Post` / `Comment` / `Reaction` 已在 `packages/db/prisma/schema.prisma`（约 615–663 行）建表并 migrate，本切片是**加列**不是建表
- **占位契约已存在**：`packages/shared/src/schemas/phase2/social.ts` 的 `PostSchema` / `CommentSchema` / `ReactionSchema`，本切片将其升级为完整请求 / 响应契约
- **预签名上传**：`POST /v1/uploads/sign` → PUT → `POST /v1/uploads/complete`（`apps/mobile/src/api/endpoints/reports.ts` 54–97 行是完整调用范例）
- **分页范式**：`apps/api/src/modules/plans/plans.service.ts` 26–60 行
- **预签名读 URL 范式**：`apps/api/src/modules/users/users.service.ts` 291–295 行（头像）、`reports.service.ts` 150–160 行（批量）
- **移动端 Tab 占位**：`RootNavigator.tsx` 124–132 行，component 现为 `features/coach/SocialPlaceholderScreen.tsx`

---

## 3. 前置阅读

1. [ADR 0011](../../adr/0011-social-feed-and-search.md) §1–3、§7、§12、§14、§15、§17（**以 ADR 为准**）
2. `packages/db/prisma/schema.prisma`（`Post` / `Comment` / `Reaction` / `Media` / `User`）
3. `packages/shared/src/schemas/phase2/social.ts`、`packages/shared/src/schemas/_common.ts`（`PaginationQuerySchema`、`paginatedSchema`）
4. `apps/api/src/modules/plans/plans.service.ts`（分页）、`apps/api/src/modules/media/uploads.service.ts`（scope 与 mime 白名单）
5. `apps/mobile/src/app/navigation/RootNavigator.tsx`、`apps/mobile/src/api/endpoints/reports.ts`

---

## 4. 详细规格

### 4.1 DB（`packages/db/prisma/schema.prisma` + 单次 migration）

新增枚举与列（ADR 0011 §17）：

```prisma
enum ModerationStatus {
  PENDING
  APPROVED
  REJECTED
}

model Post {
  // ...existing fields
  likeCount        Int              @default(0)
  commentCount     Int              @default(0)
  moderation       ModerationStatus @default(PENDING)
  moderationReason String?

  @@index([userId, createdAt])
  @@index([visibility, moderation, createdAt])   // 替换原 @@index([visibility, createdAt])
  @@index([deletedAt])
}

model Comment {
  // ...existing fields
  deletedAt DateTime?

  @@index([postId, deletedAt, createdAt])        // 替换原 @@index([postId, createdAt])
}

enum AiTaskType {
  // ...existing values
  SOCIAL_MODERATE                                 // SOCIAL-06 使用，本切片仅建枚举值
}
```

跑 `pnpm --filter db migrate:dev --name social_mvp`。

> **本切片之后禁止再加 migration**。02/03/04/06 若发现缺列，回到本文档评估而非各自新增 migration。

### 4.2 共享 Zod 契约（`packages/shared/src/schemas/phase2/social.ts`）

把现有占位 schema 升级为完整契约。移除文件头「MVP 不开放对外 API」的注释。

```ts
// 枚举（packages/shared/src/enums/phase2.ts）
MODERATION_STATUS_VALUES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
ModerationStatusSchema = z.enum(MODERATION_STATUS_VALUES);

/** API 层实际允许的可见性：FOLLOWERS 不开放（ADR 0011 §1） */
CreatablePostVisibilitySchema = z.enum(['PUBLIC', 'PRIVATE']);

// 作者信息（绝不含 phone）
SocialAuthorSchema = {
  id: IdSchema,
  displayName: z.string(), // 服务端保证非空，见 §4.5 fallback
  avatarUrl: z.string().url().nullable(),
};

// 实体：在原 PostSchema 上补计数与审核
PostSchema = {
  id,
  userId,
  body: z.string().min(1).max(2000),
  mediaIds: z.array(IdSchema).max(9).default([]),
  visibility: PostVisibilitySchema.default('PUBLIC'),
  likeCount: z.number().int().nonnegative().default(0),
  commentCount: z.number().int().nonnegative().default(0),
  moderation: ModerationStatusSchema.default('PENDING'),
  moderationReason: z.string().nullable().optional(),
  createdAt,
  updatedAt,
  deletedAt,
};

// 列表 / 详情响应
PostSummarySchema = {
  id: IdSchema,
  author: SocialAuthorSchema,
  body: z.string(),
  imageUrls: z.array(z.string().url()).default([]), // 预签名读 URL
  visibility: PostVisibilitySchema,
  moderation: ModerationStatusSchema,
  moderationReason: z.string().nullable(), // 仅作者可见，他人恒 null
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  likedByMe: z.boolean().default(false), // 本切片恒 false，SOCIAL-02 接管
  isMine: z.boolean(),
  createdAt: DateTimeSchema,
};
PostListResponseSchema = paginatedSchema(PostSummarySchema);

// 请求
CreatePostRequestSchema = {
  body: z.string().trim().min(1).max(2000),
  mediaIds: z.array(IdSchema).max(9).default([]),
  visibility: CreatablePostVisibilitySchema.default('PUBLIC'),
};
CreatePostResponseSchema = PostSummarySchema;

SocialFeedQuerySchema = PaginationQuerySchema; // { cursor?, limit }
```

从 `packages/shared/src/schemas/index.ts` → `phase2/index.ts` 导出；`pnpm --filter shared build`。

> `CommentSchema` / `ReactionSchema` 保持原样，由 03 / 02 各自扩展。

### 4.3 错误码与文案

`packages/shared/src/errors/codes.ts` 新增一组（放在「计划 / 打卡」之后）：

```
// 社区
'SOCIAL_POST_NOT_FOUND',
'SOCIAL_MEDIA_INVALID',
'SOCIAL_VISIBILITY_UNSUPPORTED',
```

`packages/shared/src/i18n/zh-CN.ts` 的 `errorMessagesZhCN` 同步配中文：

| code                            | 文案                 |
| ------------------------------- | -------------------- |
| `SOCIAL_POST_NOT_FOUND`         | 动态不存在或已删除   |
| `SOCIAL_MEDIA_INVALID`          | 图片无效，请重新选择 |
| `SOCIAL_VISIBILITY_UNSUPPORTED` | 暂不支持该可见性设置 |

> 02 / 03 / 05 / 06 会各自追加自己的错误码，不必在本切片预留。

### 4.4 上传 scope（`packages/shared/src/schemas/media.ts` + `uploads.service.ts`）

- `UPLOAD_SCOPE_VALUES` 追加 `'POST_IMAGE'`
- `uploads.service.ts` 的 `assertMimeForScope` 增分支：`POST_IMAGE` 仅接受 `image/jpeg` / `image/png` / `image/webp`（与 `MEAL_PHOTO` 保持一致即可）
- objectKey 前缀 `post/{userId}/`

### 4.5 API `social` 模块（`apps/api/src/modules/social/`）

新建 `social.module.ts` / `posts.controller.ts` / `posts.service.ts`，controller 挂 `JwtAuthGuard`，模块注册进 `app.module.ts`。路由前缀 `/v1/social`（ADR 0011 §14）。

**`POST /v1/social/posts`**

1. `parseWith(CreatePostRequestSchema, body)`
2. 若 `visibility === 'FOLLOWERS'`（Zod 已挡，防御性再判一次）→ `SOCIAL_VISIBILITY_UNSUPPORTED` 400
3. 校验 `mediaIds`：一次 `findMany({ where: { id: { in: mediaIds }, ownerUserId: userId, status: 'READY' } })`，要求**条数相等**且每条 `mime.startsWith('image/')`，否则 `SOCIAL_MEDIA_INVALID` 400
4. `create` Post（`moderation` 用默认 `PENDING`）
5. 返回 `PostSummarySchema`（`isMine: true`、计数 0）

> 关键词校验与审核入队是 SOCIAL-06 的插入点，本切片在 service 里留一行注释标注位置即可，不写空函数。

**`GET /v1/social/posts`**（广场 feed）

```ts
const { cursor, limit } = parseWith(SocialFeedQuerySchema, query);
const rows = await this.prisma.client.post.findMany({
  where: { deletedAt: null, visibility: 'PUBLIC', moderation: { not: 'REJECTED' } },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], // id 兜底：ADR 0011 §12
  take: limit + 1,
  ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
});
```

`hasMore` / `nextCursor` 完全照抄 `plans.service.ts` 的写法。

**`GET /v1/social/posts/:id`**：`deletedAt: null`；他人帖子额外要求 `visibility === 'PUBLIC'` 且 `moderation !== 'REJECTED'`，否则 `SOCIAL_POST_NOT_FOUND` 404（不泄露存在性）。作者本人不受限。

**`DELETE /v1/social/posts/:id`**：`updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date() } })`，`count === 0` 抛 `SOCIAL_POST_NOT_FOUND` 404。返回 204。

> 索引删除是 SOCIAL-04 的插入点。

**DTO 组装（本切片的性能要点，禁止 N+1）**

抽一个 `mapPosts(rows, viewerId)` 私有方法，供本切片与后续切片复用：

1. 收集整页所有 `userId` → 一次 `user.findMany({ where: { id: { in } }, include: { avatarMedia: true } })`
2. 收集整页所有 `mediaIds` 摊平去重 → 一次 `media.findMany({ where: { id: { in }, status: 'READY' } })`
3. 对上述两批结果逐个 `storage.presignGet(objectKey, SOCIAL_READ_URL_TTL_SEC)`（本地 HMAC 计算，无网络往返）
4. 按原 `mediaIds` 顺序映射为 `imageUrls`，查不到的 id **静默跳过**（媒体已 DELETED，ADR 0011 §3）
5. `displayName` 为空时 fallback `健身用户${id.slice(-4)}`——**绝不能回落到手机号**（ADR 0011 §9）
6. `moderationReason` 仅在 `isMine` 时透出，他人恒 `null`

`SOCIAL_READ_URL_TTL_SEC` 放 service 顶部常量，取 1 小时。

### 4.6 移动端（`apps/mobile/src/features/social/`）

- **删除** `apps/mobile/src/features/coach/SocialPlaceholderScreen.tsx`
- **导航**（`RootNavigator.tsx`）：`Social` Tab 的 component 改为 `FeedScreen`；`RootStackParamList` 增 `PostComposer: undefined`、`PostDetail: { postId: string }` 并注册两屏（`PostDetail` 本切片先渲染只读正文与图片，评论区由 03 补）
- **`FeedScreen`**：`useInfiniteQuery` 拉 `/social/posts`；`FlatList` + 下拉刷新 + 触底加载；右下角悬浮「发帖」按钮 push `PostComposer`；空态引导文案
- **`PostCard` 组件**：头像 + 昵称 + 相对时间 + 正文（折叠超长）+ 图片宫格；点击卡片 push `PostDetail`；`isMine` 时右上角「···」提供删除（二次确认）
- **`PostImageGrid` 组件**：1 张大图 / 2–4 张两列 / 5–9 张三列九宫格
- **`PostComposerScreen`**：多行输入（2000 字计数）+ 最多 9 张图选择（复用 `features/media` 的相机 / 相册）→ 逐张 `POST_IMAGE` scope 预签名上传拿 `mediaId` → `POST /social/posts` → 成功后 `invalidateQueries` 并返回
- **api hooks**（`apps/mobile/src/api/endpoints/social.ts`）：`useSocialFeed()` / `usePostDetail(id)` / `useCreatePost()` / `useDeletePost()`，响应一律 `XxxSchema.parse()`
- **queryKeys**（`apps/mobile/src/api/queryKeys.ts`）：

```ts
socialFeed: ['social-feed'] as const,
socialPost: (id: string) => ['social-post', id] as const,
```

---

## 5. 建议改动文件

| 路径                                                         | 动作                                                                 |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| `packages/db/prisma/schema.prisma`                           | 加列 / 枚举 / 索引 + migration `social_mvp`                          |
| `packages/shared/src/enums/phase2.ts`                        | `ModerationStatusSchema`                                             |
| `packages/shared/src/schemas/phase2/social.ts`               | 占位 schema 升级为完整契约                                           |
| `packages/shared/src/schemas/media.ts`                       | `UPLOAD_SCOPE_VALUES` 加 `POST_IMAGE`                                |
| `packages/shared/src/errors/codes.ts`                        | 3 个社区错误码                                                       |
| `packages/shared/src/i18n/zh-CN.ts`                          | 对应中文文案                                                         |
| `apps/api/src/modules/social/`                               | 新建 module / controller / service                                   |
| `apps/api/src/app.module.ts`                                 | 注册 `SocialModule`                                                  |
| `apps/api/src/modules/media/uploads.service.ts`              | `POST_IMAGE` 的 mime 分支                                            |
| `apps/mobile/src/features/social/`                           | 新建 FeedScreen / PostComposerScreen / PostDetailScreen / components |
| `apps/mobile/src/features/coach/SocialPlaceholderScreen.tsx` | **删除**                                                             |
| `apps/mobile/src/app/navigation/RootNavigator.tsx`           | Tab component 替换 + 两屏注册                                        |
| `apps/mobile/src/api/endpoints/social.ts`                    | hooks                                                                |
| `apps/mobile/src/api/queryKeys.ts`                           | `socialFeed` / `socialPost`                                          |

---

## 6. Acceptance criteria

- [x] `pnpm --filter db migrate:dev --name social_mvp` 成功，`pnpm typecheck` 全仓通过
- [x] `POST /v1/social/posts` 能发纯文本帖与带图帖；`visibility: 'FOLLOWERS'` 返回 400 `SOCIAL_VISIBILITY_UNSUPPORTED`
- [x] 用他人的 `mediaId` 或未 `READY` 的 `mediaId` 发帖返回 400 `SOCIAL_MEDIA_INVALID`
- [x] `GET /v1/social/posts` 时间倒序分页正确，`nextCursor` 翻页无重复无遗漏；`PRIVATE` 帖子不出现在他人 feed
- [x] feed 一页 20 帖时**只发出常数条 SQL**（1 帖子 + 1 用户 + 1 媒体），可用 pino 日志或 Prisma `log: ['query']` 核验
- [x] 响应中**不含 `phone` 字段**；`displayName` 为空的用户显示为 `健身用户XXXX`
- [x] `DELETE` 自己的帖子后从 feed 消失；删他人帖子返回 404
- [x] 移动端：社区 Tab 打开即 feed，可发帖（含 3 张图）、下拉刷新、触底加载、删除自己的帖子（Android 真机 / 模拟器）
- [x] `features/coach/SocialPlaceholderScreen.tsx` 已删除且无残留引用

---

## 7. 验证步骤

```powershell
pnpm --filter db migrate:dev --name social_mvp
pnpm --filter shared build
pnpm typecheck
pnpm --filter api start:api
# 一键冒烟（纯文本 / 带图 / FOLLOWERS / phone / displayName / mediaId 校验）：
.\scripts\social-01-smoke.ps1
# 或 Swagger http://localhost:3000/swagger 手测 /v1/social/posts
pnpm --filter mobile start
```

---

## 8. 不做

- 点赞（SOCIAL-02）、评论（SOCIAL-03）
- 检索索引与搜索（SOCIAL-04 / 05）
- 关键词与 LLM 审核（SOCIAL-06）
- seed 与验收脚本（SOCIAL-07）
- 帖子编辑、举报、话题标签、结构化打卡附件（ADR 0011 明确不做）

---

## 9. 交付物 / 下游

| 交付物                                     | 消费者                                                      |
| ------------------------------------------ | ----------------------------------------------------------- |
| `social_mvp` migration（全 Epic 唯一一次） | 02（计数列）、06（`moderation` / `SOCIAL_MODERATE`）        |
| `PostSummarySchema` + `mapPosts()`         | 02（`likedByMe`）、03（详情页）、05（搜索结果复用同一卡片） |
| `social` 模块骨架 + `/v1/social` 前缀      | 02 / 03 / 05 / 06 的 controller 挂载点                      |
| `POST_IMAGE` scope                         | 07（seed 说明）、未来结构化附件                             |
| `features/social/` + `PostCard`            | 03（详情）、05（搜索结果列表）                              |
