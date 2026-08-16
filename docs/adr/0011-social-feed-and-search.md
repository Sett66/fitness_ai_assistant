# 0011 — 社区动态流：公开广场、外部检索与先发后审

## Context

PRD §3.2 P2 规划了「社区动态流：Post / Comment / Reaction；分享打卡 / 食谱 / 训练照片」，P3 规划训练伙伴匹配，P4 规划站内通知。ARCHITECTURE §3 预留了 `(social)` 模块占位，§4 已给出 `Post` / `Comment` / `Reaction` / `PartnerProfile` 的模型草案，§9 演进表写明「社区上线 → 启用 `(social)` 模块 + 简单内容审核（关键词 + LLM 兜底）」。

M0–M5 与体检报告 Epic（ADR 0009）关闭后进入社交。本 ADR 固化其架构决策，作为 `docs/issues/social/SOCIAL-0X.md` 各切片的共同依据。

现状可复用的基建：

- **数据模型已 migrate**：`Post`（含 `mediaIds String[]`、`visibility`、`deletedAt`）、`Comment`（含 `parentId` 自关联）、`Reaction`（主键 `(postId, userId)`）已在 `packages/db/prisma/schema.prisma` 落地
- **占位契约已存在**：`packages/shared/src/schemas/phase2/social.ts`、`packages/shared/src/enums/phase2.ts`（`PostVisibility` / `ReactionKind`）
- **预签名上传**（ADR [0004](./0004-presigned-upload.md)）：`UploadScope` 需新增 `POST_IMAGE`
- **AI 异步链路**（ADR [0003](./0003-modular-monolith-with-worker.md)、[0005](./0005-m3-ai-context-and-execution.md)）：`AiRun` + BullMQ + `AiTaskProcessor.dispatch` 分支范式
- **可移植性接口先例**：PRD §6 已有 `StorageProvider` / `LLMProvider` / `OAuthProvider`；本 ADR 新增第四个 `SearchProvider`
- **移动端占位**：底部 Tab 已有 `Social`（`RootNavigator.tsx`），组件 `SocialPlaceholderScreen` 目前错置于 `features/coach/`
- **分页约定**：`PaginationQuerySchema` + Prisma `cursor: { id }` + `skip: 1` + `nextCursor`

## Decision

### 1. 关系模型：纯公开广场，不做关注

MVP **不建 `Follow` 表**，feed 是全站公开帖的时间倒序，不存在「关注流」。

- `PostVisibility` 枚举保留三值不动（减枚举值的 migration 成本高于留着不用），但 **API 层只接受 `PUBLIC` 与 `PRIVATE`**，收到 `FOLLOWERS` 返回 `SOCIAL_VISIBILITY_UNSUPPORTED` 400。
- `PRIVATE` 语义为「仅自己可见」，不进 feed、不进搜索索引。
- 理由：demo 无用户密度，关注流恒为空页面；关注是**加表**而非改表，未来启用为纯增量。

**连带取消**：PRD §3.2 P3 训练伙伴匹配、P4 站内通知均**不在本 Epic**。通知的唯一触发源是「他人对我的帖子的动作」，在单人 demo 中等价于自己通知自己；且通知有独立的横切设计（多类型、聚合、已读语义），应作为独立 Epic 与计划生成完成、报告分析完成等既有异步任务一并接入。

### 2. 帖子形态：文本 + 图片，结构化附件后置

`Post.body` + `mediaIds`（最多 9 张图）即完整形态。**不做**「分享打卡 / 分享某餐」的结构化卡片。

未来启用时的形状预先确定，但**本 Epic 不建表、不留空列**：新增 `PostAttachment(postId, kind, refId, snapshotJson)`，`snapshotJson` 存**快照**而非实时 join——否则用户事后修改 `WorkoutSession` 或软删 `MealLog` 会导致历史帖子变脸或渲染失败。

### 3. 媒体：保留 `mediaIds String[]`，服务层校验归属

不改为 `PostMedia` 关系表。社区图片是「一次写入、按帖整体读出」，不存在按媒体反查帖子的查询，join 收益为零。

- 发帖时校验每个 id：`ownerUserId === 当前用户` && `status === 'READY'` && `mime` 以 `image/` 开头；任一不满足返回 `SOCIAL_MEDIA_INVALID`。一次 `findMany` 断言条数相等，禁止逐 id 查询。
- 读 feed 时把整页所有 `mediaIds` **摊平成一个数组做一次 `findMany`**，禁止逐帖查询（N+1）。
- 对外 DTO **不回传 `mediaIds`**，只回传 `imageUrls`（预签名读 URL）。客户端没有理由持有内部 media id。
- 展示 URL 沿用现有做法：`storage.presignGet(objectKey, TTL)` 逐个签发（本地 HMAC 计算，无网络往返），与 `users.service.ts` 头像、`reports.service.ts` 页图同构。TTL 取 1 小时（`SOCIAL_READ_URL_TTL_SEC`）。
- 媒体被置为 `DELETED` 时留下的悬空 id 在渲染层静默过滤，不报错。
- `UploadScope` 新增 `POST_IMAGE`，objectKey 前缀 `post/{userId}/`，mime 白名单与 `MEAL_PHOTO` 对齐：`image/jpeg` / `image/png` / `image/webp`。

### 4. 点赞：只做 `LIKE`，幂等 `PUT` / `DELETE`

`ReactionKind` 保留四值，API 层只接受 `LIKE`。不做长按表情选择器、不做按 kind 分组计数。请求无 body（`kind` 不由客户端指定）。

接口用 **`PUT /like` + `DELETE /like` 这对幂等操作**，而非 `POST /like` 切换（toggle）。移动端弱网重试是常态，toggle 语义下一次重试就把赞取消了；幂等语义天然免疫。响应回带 `{ postId, likeCount, likedByMe }` 供客户端对齐乐观更新。

### 5. 计数：`Post` 上的冗余列，事务内维护

`Post` 新增 `likeCount` / `commentCount`，**不用** Prisma `_count` 实时聚合。理由：计数是极端读多写少；未来若要「热门排序」或「个人总获赞数」，实时聚合无法索引排序。

代价是漂移风险，用两条纪律控制：

1. **幂等接口不得无条件 `increment`**。点赞在事务内先 `create` Reaction，靠 `(postId, userId)` 主键唯一约束挡重复，捕获 Prisma `P2002` 后直接返回当前计数**不加一**；只有 create 真正成功才 `increment`。取消赞判断 `deleteMany` 返回的 `count === 1` 才 `decrement`。评论软删同理。
2. 计数的每一次变更必须与主体写入在**同一个 `prisma.$transaction`** 内。

`likedByMe` 在 `mapPosts` 内对整页 `postId` **一次** `reaction.findMany`，不得逐帖查询。

### 6. 评论：单层平铺，`parentId` 仅作展示

评论列表是 `where postId, deletedAt: null order by createdAt asc` 的一次分页。`parentId` 照常写入，但**只用于渲染「回复 @某某」前缀**，不做树形聚合、不做「查看全部 N 条回复」的二级分页。传入的 `parentId` 必须属于同一帖且未软删，否则 `SOCIAL_COMMENT_NOT_FOUND` 404。

窄屏上超过两层不可读；升级为楼中楼时数据已在 `parentId` 内，是纯读取层改造，无需数据迁移。

`Comment` 补 `deletedAt`（原 schema 缺失，违反 PRD §5.4 软删通则），删除走软删并在同一事务 `decrement`。

### 7. 生命周期：只做删除，不可编辑，不做举报

- **不可编辑**。编辑会让审核与索引两条异步链路都必须处理「更新中」状态，是竞态高发区。「帖子内容一旦写入即不变」是本设计的一条不变量，两条链路因此只需处理新增与删除。
- **软删**：作者删除自己的帖子 / 评论，置 `deletedAt`，同时从检索索引移除、维护计数。
- **不做举报表**：项目无后台管理界面，举报入库后无人处理，是纯装饰。
- **系统下架 ≠ 用户删除**：审核判定违规用 `moderation = REJECTED` 表达，**不复用 `deletedAt`**。作者仍能在自己的帖子列表看到它与 `moderationReason`，他人不可见。
- **存在性不泄露**：他人请求 `PRIVATE` / `REJECTED` / 已软删 / 不存在的帖，一律 `SOCIAL_POST_NOT_FOUND` 404，不区分 403。作者本人可见自己的全部未软删帖。

### 8. 检索：Meilisearch，但抽象为 `SearchProvider`

选 Meilisearch 而非 Postgres 方案，核心原因是中文分词：

| 方案                    | 判断                                                                     |
| ----------------------- | ------------------------------------------------------------------------ |
| `to_tsvector('simple')` | **不可用**。整句中文成为一个 token，搜「深蹲」匹配不到「今天深蹲 100kg」 |
| `zhparser` / `pg_jieba` | 不在 `postgres:16-alpine` 内，需自建镜像，破坏「一条命令起全套依赖」     |
| `pg_trgm` + `ILIKE`     | 可用但无相关性排序、无错字容错；三字以下查询退化为顺序扫描               |
| **Meilisearch**         | **选用**。中文分词（charabia）、错字容错、相关性排序开箱即用             |

为对冲「多一个中间件」的代价，后端封装 `SearchProvider` 接口，与 PRD §6 已有的 `StorageProvider` / `LLMProvider` / `OAuthProvider` 同构，作为第四个可移植性接口。落地目录 `apps/api/src/infra/search/`：

```ts
type PostSearchDoc = { id: string; userId: string; body: string; createdAtTs: number };
type UserSearchDoc = { id: string; displayName: string };
type SearchPage = { ids: string[]; estimatedTotal: number };

interface SearchProvider {
  readonly name: 'meili' | 'pg';
  init(): Promise<void>; // 建索引 + 应用 settings，幂等
  indexPost(doc: PostSearchDoc): Promise<void>;
  deletePost(postId: string): Promise<void>;
  indexUser(doc: UserSearchDoc): Promise<void>;
  searchPosts(q: string, page: { offset: number; limit: number }): Promise<SearchPage>;
  searchUsers(q: string, page: { offset: number; limit: number }): Promise<SearchPage>;
  clearAll(): Promise<void>; // reindex 脚本用
}
```

两个实现：`MeiliSearchProvider`、`PgSearchProvider`（后者写操作为 no-op，读走 `contains` + `mode: 'insensitive'`）。由 `SEARCH_PROVIDER` 环境变量**显式**选择，`SearchModule.onModuleInit` 调用 `init()` 并在启动日志打印当前 provider（排查「搜不到」的第一现场，不可省略）。

**严禁隐式 fallback**：Meili 调用失败不得静默转 `ILIKE`，否则「搜不到」时无法区分是索引未同步还是服务不可用。失败即抛 `SOCIAL_SEARCH_UNAVAILABLE` **503**。前端展示明确错误态与重试，**不把失败渲染成空结果**。

`PgSearchProvider` 的存在同时解决了两件事：CI 不必新增服务；service 单测可注入假 provider。

Meilisearch 作为 docker-compose 的**第四个服务**接入（postgres / redis / minio 之后），走现有风格：健康检查 + 命名卷 `fitness_meilidata` + `fitness` 网络。索引名 `${MEILI_INDEX_PREFIX}_posts` / `${MEILI_INDEX_PREFIX}_users`（默认 `fitness_posts` / `fitness_users`）。中文分词由内置 charabia 处理，无需额外配置。

### 9. 检索只存倒排，展示数据一律回 Postgres

`searchPosts` / `searchUsers` **只返回 id 数组**，服务端再用 `findMany({ where: { id: { in: ids } } })` 回库取权威数据并**按 ids 顺序重排**（Postgres `IN` 不保序，相关性顺序来自 Meili）。回库后被过滤掉的 id（刚软删 / 刚被拒但索引未同步）**静默丢弃，不补位**。

这条决策带来一个关键简化：**索引文档不含 `likeCount` / `commentCount`**，因此点赞和评论**不触发重新索引**。索引文档只需：

```
posts: { id, userId, body, createdAtTs }   // searchable: body; filterable: userId; sortable: createdAtTs
users: { id, displayName }                 // searchable: displayName
```

评论内容**不入索引**。触发重索引的事件因此收敛为三个：帖子创建、帖子删除 / 审核拒绝、用户昵称变更。

**隐私红线**：

- `User.phone` 不进任何索引、不进任何社交 DTO。搜索不得以任何形式命中手机号。
- 公开档案不含 `role`、不含任何身体数据（`Profile` / `StrengthLevel`）。
- `displayName` 为空时服务端 fallback 为 `健身用户${id.slice(-4)}`——**绝不能回落到手机号**。同一 fallback 用于 feed、搜索、用户主页、以及写入用户索引的 `displayName`。

搜索查询契约：`q`（1–64 字）+ `type=POST|USER`（默认 `POST`）+ cursor 分页。一个联合响应而非两个端点，前端切 Tab 只换 `type`。

### 10. 索引同步走 BullMQ 独立队列

发帖事务提交后 enqueue 索引任务，worker 消费写 Meili，失败按现有指数退避重试。Meili 短暂宕机不影响发帖，恢复后自动补上；代价是秒级索引延迟（产品上无感，用户发完帖看的是 feed 不是搜索页）。

- **新队列** `fitness-social-index` + 独立 `SocialIndexProcessor`，**不复用** `fitness-ai-task`。索引任务不产生 `AiRun`，混入 `AiTaskProcessor` 会让其职责继续膨胀。
- job payload：`{ op: 'INDEX_POST' | 'DELETE_POST' | 'INDEX_USER', id }`。Processor **回库取最新状态**再决定索引还是删除，不信任 payload 里的旧值——重复消费与乱序消费因此都安全。已软删 / `PRIVATE` / `REJECTED` 的帖一律走 `deletePost`。
- **必须在事务提交之后入队**，不能放在 `$transaction` 回调内——否则事务回滚了任务却已经发出。
- 客户端**不直连** Meilisearch（master key 必然泄露，且绕过后端就无法过滤软删、`PRIVATE` 与 `REJECTED`），搜索统一走 `GET /v1/social/search` 代理。
- 必须配套**全量 reindex 脚本**（`pnpm --filter api reindex:social`）：这是索引漂移与 Meili 数据卷丢失的唯一兜底路径。脚本 `clearAll` 后分批扫库重建；seed 跑完后必须提示执行它。

### 11. 搜索分页：把 offset 编码进 cursor

Meilisearch 是 offset/limit 分页，与仓库 `{ cursor, limit }` + `nextCursor` 的契约形状冲突。**不为搜索单开一套契约**：cursor 直接编码 offset 字符串，非法 cursor 视为 `0`，`nextCursor = String(offset + limit)`，返回结果不足 limit 时 `nextCursor = null`。

前端 `useInfiniteQuery` 与 feed 完全一致，`PgSearchProvider` 也用 offset 语义保持两实现对齐。

### 12. Feed 分页：沿用契约 + `id` 兜底排序键

沿用 `PaginationQuerySchema` + `cursor: { id }` + `skip: 1` + `take: limit + 1` + `nextCursor`。

**唯一增强**：`orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]`。Prisma 的 cursor 分页依据游标行的排序字段值定位，`createdAt` 并列时会漏行或重复；feed 是全站聚合，撞并列的概率远高于「用户看自己记录」的既有列表。对外契约一字不变。用户主页帖子列表沿用同一套排序与 cursor。

### 13. 内容审核：先发后审

落地 ARCHITECTURE §9 承诺的「关键词 + LLM 兜底」。

1. **同步关键词**：发帖 / 发评论时过一遍 `packages/shared/src/constants/social-moderation.ts` 的词表，命中直接 400 `SOCIAL_CONTENT_REJECTED`，不落库。词表只收 5–10 个中性示例词（demo 验证链路，不堆真实敏感词库）。匹配前归一化（大小写、空白、常见分隔符）。**响应不回带命中的具体词**。
2. **异步 LLM**：帖子以 `moderation = PENDING` 创建并**立即可见**，同时 enqueue `AiRun(SOCIAL_MODERATE)`；worker 调 DeepSeek 判定后回写 `APPROVED` 或 `REJECTED` + `moderationReason`（`APPROVED` 时 reason 置 `null`），`REJECTED` 时 enqueue 索引删除。
3. **可见性判据**：feed / 搜索 / 详情对他人过滤 `moderation !== 'REJECTED'`（即 `PENDING` 与 `APPROVED` 都可见）；作者本人可见全部。`PENDING` **不做任何「审核中」UI**——先发后审的前提就是用户无感。
4. **评论不走 LLM**：评论量大、单条价值低，只做同步关键词。图片内容审核（VLM 鉴黄）本 Epic 不做。
5. **LLM 失败兜底**：`AiRun` 走现有 `FAILED` + 指数退避；帖子**保持 `PENDING` 且保持可见**。宁可漏审，也不因审核服务不可用让用户的帖子凭空消失。processor catch 里**不要**给 `SOCIAL_MODERATE` 加特殊状态回写。
6. **判定范围**：只拦色情 / 暴力 / 政治敏感 / 广告引流 / 人身攻击。**健身相关的争议内容（激进饮食法、非处方补剂讨论等）一律放行**——这是健身社区，过度拦截比漏拦更伤体验。`reason` 限 100 字以内、中文。

不选先审后发：自己发帖要等数秒才可见，且 worker 一挂所有帖子永久卡在不可见状态。

**开关与配额**：

- `SOCIAL_MODERATION_ENABLED=false` 时发帖直接 `APPROVED` 且不入队（无 LLM 额度时社区仍完全可用）。默认 `true`。
- 审核**落 `AiRun`** 保持 PRD §5.3「所有 AI 调用都有成本记录」，但**不调用 `assertDailyLimit`**，也**不登记**进 `AI_TASK_DAILY_LIMITS`——它是系统行为，计入 PRD §7 的用户每日配额会导致发几个帖就耗光计划生成额度。
- 模型取 `LLM_MODELS.DEEPSEEK_V4_FLASH`（判定任务简单，走低成本快速路径）。

### 14. 路由前缀 `/v1/social/*`（对 ARCH §8.3 的有意偏离）

ARCHITECTURE §8.3 规定 `/v1/{resource}` 复数、无命名空间。社交涉及 posts / comments / search / users 四组资源，其中 `users` 会与既有用户接口语义撞车。**本 ADR 明确采用 `/v1/social/` 命名空间**，记录为对 §8.3 的一处有意偏离，后续同类聚合型模块可援引。

端点全集：

| 端点                                 | 职责                                                            |
| ------------------------------------ | --------------------------------------------------------------- |
| `POST /v1/social/posts`              | 发帖（关键词校验 → 建 Post → enqueue 索引 + 审核）              |
| `GET /v1/social/posts`               | 广场 feed（keyset 分页）                                        |
| `GET /v1/social/posts/:id`           | 帖子详情                                                        |
| `DELETE /v1/social/posts/:id`        | 作者软删 + 索引删除                                             |
| `GET /v1/social/posts/:id/comments`  | 评论列表（时间升序分页）                                        |
| `POST /v1/social/posts/:id/comments` | 发表评论（事务内 `commentCount++`）                             |
| `DELETE /v1/social/comments/:id`     | 作者软删评论（事务内 `commentCount--`）                         |
| `PUT /v1/social/posts/:id/like`      | 幂等点赞                                                        |
| `DELETE /v1/social/posts/:id/like`   | 幂等取消                                                        |
| `GET /v1/social/search`              | `q` + `type=POST\|USER` + cursor 分页，后端代理                 |
| `GET /v1/social/users/:userId`       | 公开档案（昵称、头像、发帖数、注册时间；**无手机号**）          |
| `GET /v1/social/users/:userId/posts` | 某用户的帖子；`userId` 为本人时额外包含 `PRIVATE` 与 `REJECTED` |

「我的帖子」不单开端点：看自己走 `GET /v1/social/users/:me/posts` 的 `isSelf` 分支即可。

### 15. 移动端：平铺进 RootStack

`Social` Tab 的 component 由 `SocialPlaceholderScreen` 换为 `FeedScreen`，其余四屏（发帖 / 详情 / 搜索 / 用户主页）**平铺进 `RootStackParamList`**，与 Plan / Report 一致：

| 屏             | 参数         | 入口                                     |
| -------------- | ------------ | ---------------------------------------- |
| `FeedScreen`   | —（Tab）     | 底部「社区」                             |
| `PostComposer` | `undefined`  | Feed 悬浮发帖按钮                        |
| `PostDetail`   | `{ postId }` | 点卡片                                   |
| `SocialSearch` | `undefined`  | Feed 顶部搜索条（假输入框，点击再 push） |
| `SocialUser`   | `{ userId }` | 点头像 / 昵称；搜索用户 Tab              |

全仓无任何 Tab 内嵌套导航器；引入首个嵌套器需付出 `CompositeScreenProps` 类型拼接与手动隐藏 Tab 栏的代价。而平铺 push 会覆盖整个 Tab 容器、底部栏自动消失，正是发帖页与详情页需要的全屏效果。

新建 `apps/mobile/src/features/social/`，并将错置于 `features/coach/` 的占位屏一并清理。搜索输入防抖 400ms；`q` 为空不发请求。

### 16. 验收数据：seed 造内容 + 脚本验链路

社交是首个**依赖他人数据**才能验收的功能：广场、搜索、点赞他人、评论他人在单账号下全是空列表。两者分工明确：

- **seed**（`packages/db/prisma/seed-social.ts`，独立于产品数据 seed）：3–5 个演示用户 + 数十条帖子 + 若干评论点赞，幂等 upsert，`reset-db` 后一条命令回满。图片无法凭空写入 MinIO，故 seed 帖子以纯文本为主。`moderation` 直接 `APPROVED`，不触发 LLM。计数必须用 `groupBy` 回算写回，禁止手工累加。跑完必须提示执行 `reindex:social`。
- **验收脚本**（`scripts/social-acceptance.ps1`，仿 `m4-acceptance.ps1`）：证明「发帖 → 审核 → 索引 → 搜到 → 点赞 → 计数正确」端到端通。无 LLM / 无 Meili 时分别用 `-SkipModeration` / `-SkipSearch` 跳过对应断言。

### 17. Schema 变更一次做完

所有 DB 变更集中在 **SOCIAL-01 的单次 migration**（`social_mvp`），即使 `moderation` 等列要到 SOCIAL-06 才被使用：

```
enum ModerationStatus { PENDING | APPROVED | REJECTED }

Post     + likeCount Int @default(0)
         + commentCount Int @default(0)
         + moderation ModerationStatus @default(PENDING)
         + moderationReason String?
         ~ @@index([visibility, moderation, createdAt])   // 替换原 [visibility, createdAt]

Comment  + deletedAt DateTime?
         ~ @@index([postId, deletedAt, createdAt])

AiTaskType + SOCIAL_MODERATE
```

多切片各带一次 migration 会让并行开发时的时间戳顺序打架，而这些列加了不用零代价。SOCIAL-01 之后禁止再为社区加 migration；缺列回到本 ADR 评估。

### 18. 环境变量

与 ADR [0010](./0010-coach-chat-observability-langfuse.md) 同级，配置校验放在 `apps/api` 的 `env.schema.ts`。`MEILI_*` 的「启用时才 required」照抄 `LANGFUSE_*` 的 Joi 条件写法；`MEILI_HOST` 用 `127.0.0.1` 而非 `localhost`，规避 Windows 上 IPv6 解析问题（同 `DATABASE_URL` 的既有坑）。

| 变量                        | 必需                              | 默认                    | 说明                                   |
| --------------------------- | --------------------------------- | ----------------------- | -------------------------------------- |
| `SEARCH_PROVIDER`           | 否                                | `meili`                 | `meili` \| `pg`，**显式**选择实现      |
| `MEILI_HOST`                | `SEARCH_PROVIDER=meili` 且非 test | `http://127.0.0.1:7700` | Meilisearch 地址                       |
| `MEILI_MASTER_KEY`          | 同上                              | —                       | 与 docker-compose 中一致               |
| `MEILI_INDEX_PREFIX`        | 否                                | `fitness`               | 得到 `fitness_posts` / `fitness_users` |
| `SOCIAL_MODERATION_ENABLED` | 否                                | `true`                  | `false` 时发帖直接 `APPROVED` 且不入队 |

CI 与单测走 `SEARCH_PROVIDER=pg`，不启 Meili 容器。

### 19. 错误码

全部落 `packages/shared/src/errors/codes.ts` + `i18n/zh-CN.ts`。HTTP 状态见下表；**他人不可见的帖一律 404，不区分 403**。

| code                            | HTTP | 文案                                   |
| ------------------------------- | ---- | -------------------------------------- |
| `SOCIAL_POST_NOT_FOUND`         | 404  | 动态不存在或已删除                     |
| `SOCIAL_COMMENT_NOT_FOUND`      | 404  | 评论不存在或已删除                     |
| `SOCIAL_MEDIA_INVALID`          | 400  | 图片无效，请重新选择                   |
| `SOCIAL_VISIBILITY_UNSUPPORTED` | 400  | 暂不支持该可见性设置                   |
| `SOCIAL_CONTENT_REJECTED`       | 400  | 内容包含不允许发布的词语，请修改后重试 |
| `SOCIAL_SEARCH_UNAVAILABLE`     | 503  | 搜索服务暂时不可用，请稍后再试         |

### 20. 对外 DTO 与组装纪律

列表 / 详情 / 搜索结果共用 `PostSummarySchema`，由 `mapPosts(rows, viewerId)` 一次组装，禁止 N+1：

```
PostSummary {
  id, author: { id, displayName, avatarUrl },
  body, imageUrls[],
  visibility, moderation, moderationReason,   // reason 仅 isMine 时透出，他人恒 null
  likeCount, commentCount, likedByMe, isMine,
  createdAt
}
```

组装步骤（整页常数条 SQL：帖子 + 用户 + 媒体 + 点赞）：

1. 收集整页 `userId` → 一次 `user.findMany`（含头像 media）
2. 摊平去重整页 `mediaIds` → 一次 `media.findMany({ status: 'READY' })`
3. 逐个 `presignGet`；悬空 id 静默跳过
4. `displayName` 空则 fallback `健身用户${id.slice(-4)}`
5. `moderationReason` 仅 `isMine` 透出

公开档案 `SocialUserProfileSchema`：`{ id, displayName, avatarUrl, postCount, joinedAt }`。`postCount` 只计他人可见帖（`PUBLIC` 且非 `REJECTED`）。

### 21. 切片划分

实施拆为 7 个 AFK 切片，细节在 `docs/issues/social/`。本 ADR 只钉依赖与边界，避免切片各自发明架构：

```
ADR 0011
   │
   ▼
SOCIAL-01 ─┬─► SOCIAL-02 ─┐
           ├─► SOCIAL-03 ─┤
           ├─► SOCIAL-04 ──► SOCIAL-05 ─┼─► SOCIAL-07
           └─► SOCIAL-06 ──────────────┘
```

| 切片      | 交付                                                               |
| --------- | ------------------------------------------------------------------ |
| SOCIAL-01 | 发帖 + 广场 feed 闭环；**全 Epic 唯一一次** `social_mvp` migration |
| SOCIAL-02 | 幂等点赞 + 事务计数 + `likedByMe`                                  |
| SOCIAL-03 | 单层评论 + 详情页评论区                                            |
| SOCIAL-04 | Meili 容器 + `SearchProvider` + 索引队列 + reindex 脚本            |
| SOCIAL-05 | 搜索 API + 搜索页 + 用户主页                                       |
| SOCIAL-06 | 关键词 + LLM 先发后审                                              |
| SOCIAL-07 | seed 演示数据 + 端到端验收脚本                                     |

02 / 03 / 04 / 06 在 01 之后可并行；06 对 04 为软依赖（`REJECTED` 后的索引删除，04 未交付时先留 TODO）。

## Consequences

- **正面**：feed / 计数 / 分页全部走既有范式，无新概念；`SearchProvider` 让 Meili 成为可拆卸组件，CI 与单测不依赖容器；索引只存倒排使点赞评论不触发重索引，同步事件收敛为三个；「帖子不可变」消除了审核与索引链路的更新态竞态；先发后审 + LLM 失败保持可见，保证审核挂掉时社区仍可用。
- **负面**：docker-compose 新增第四个服务（Meilisearch），本地资源占用上升；索引与库之间存在秒级一致性窗口，且需要维护 reindex 脚本；`SEARCH_PROVIDER` 造成本地与预期环境的搜索质量差异，排查问题需先确认 provider；审核为每篇帖子引入一次 LLM 调用成本；计数冗余列有漂移风险，靠事务纪律而非 DB CHECK 约束。
- **对既有**：`Post` / `Comment` 加列 + `AiTaskType` 加值需 migration；`UploadScope` 增 `POST_IMAGE` 需同步 `uploads.service` 的 mime 白名单分支；`packages/shared/src/schemas/phase2/social.ts` 由占位 schema 升级为完整请求 / 响应契约；`env.schema.ts` 新增 5 个变量；ARCHITECTURE §3 的 `(social)` 占位落地为实模块；`FitnessQueueModule` 从单队列变为双队列。
- **对 ARCH §8.3**：`/v1/social/` 命名空间是有意偏离，后续聚合型模块可援引本 ADR。
- **明确不做**：`Follow` 表与关注流、`Notification` 表与站内通知、`PartnerProfile` 伙伴匹配、举报与后台治理、帖子编辑、多表情、结构化打卡附件、话题标签、评论 LLM 审核、图片鉴黄、搜索高亮 / 历史 / 热搜、用户封禁与发帖频率限制。

## References

- PRD §3.2 P2/P3/P4、§5.3、§5.4、§6、§7；ARCHITECTURE §3、§4、§8.3、§9
- ADR [0002](./0002-rest-zod-contract.md)（REST + Zod 契约）、[0003](./0003-modular-monolith-with-worker.md)（Worker）、[0004](./0004-presigned-upload.md)（presigned 上传）、[0005](./0005-m3-ai-context-and-execution.md)（AI 任务与配额）、[0009](./0009-health-report-analysis.md)（`mediaIds String[]` 松关联先例）、[0010](./0010-coach-chat-observability-langfuse.md)（条件 env 校验先例）
- `docs/issues/social/README.md`（分切片实施文档）

## Status

Accepted · 2026-08-14
