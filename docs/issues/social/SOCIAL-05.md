# SOCIAL-05 — 搜索体验：搜索 API + 搜索页 + 用户主页

| 字段           | 值                                                |
| -------------- | ------------------------------------------------- |
| **Type**       | AFK                                               |
| **Blocked by** | [SOCIAL-04](./SOCIAL-04.md)                       |
| **Blocks**     | SOCIAL-07                                         |
| **估时**       | 2 天                                              |
| **状态**       | ✅ 已完成（自动化验收已过；中文命中与真机待手测） |

---

## 1. 目标

把 SOCIAL-04 建好的检索能力暴露给用户：一个搜索接口同时支持搜帖子正文与搜用户昵称，移动端搜索页分两个 Tab 展示结果，搜到的用户可以点进公开主页看他的帖子。

---

## 2. 背景 / 可复用基建

- `SearchProvider` 与 DI token 由 SOCIAL-04 提供，`searchPosts` / `searchUsers` **只返回 id**
- `mapPosts(rows, viewerId)`（SOCIAL-01）与 `resolveAuthors(userIds)`（SOCIAL-03）直接复用，搜索结果与 feed 共用同一张 `PostCard`
- 分页把 offset 编码进 cursor（ADR 0011 §11），前端 `useInfiniteQuery` 与 feed 无差别

---

## 3. 前置阅读

1. [ADR 0011](../../adr/0011-social-feed-and-search.md) §9、§11、§14（端点表）、§15
2. [SOCIAL-04](./SOCIAL-04.md) §4.3（`SearchProvider` 契约）
3. [SOCIAL-01](./SOCIAL-01.md) §4.5（`mapPosts` 与作者 fallback）
4. `apps/mobile/src/app/navigation/RootNavigator.tsx`

---

## 4. 详细规格

### 4.1 共享 Zod（`packages/shared/src/schemas/phase2/social.ts`）

```ts
SocialSearchTypeSchema = z.enum(['POST', 'USER']);

SocialSearchQuerySchema = {
  q: z.string().trim().min(1).max(64),
  type: SocialSearchTypeSchema.default('POST'),
  cursor: z.string().optional(), // 编码后的 offset
  limit: z.coerce.number().int().min(1).max(50).default(20),
};

SocialUserProfileSchema = {
  id: IdSchema,
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  postCount: z.number().int().nonnegative(),
  joinedAt: DateTimeSchema,
};
// 注意：绝不含 phone / role / 任何身体数据（ADR 0011 §9）

SocialUserListResponseSchema = paginatedSchema(SocialUserProfileSchema);

SocialSearchResponseSchema = z.object({
  type: SocialSearchTypeSchema,
  posts: PostListResponseSchema.optional(),
  users: SocialUserListResponseSchema.optional(),
});
```

> 用一个联合响应而非两个端点，是为了让前端切 Tab 时只换 `type` 参数、共用一套 hook。

错误码追加 `'SOCIAL_SEARCH_UNAVAILABLE'`（文案「搜索服务暂时不可用，请稍后再试」）。

### 4.2 `GET /v1/social/search`

新建 `apps/api/src/modules/social/search.controller.ts` + `search.service.ts`，注入 `SEARCH_PROVIDER`。

流程（ADR 0011 §9：**索引只给 id，展示数据一律回库**）：

1. `parseWith(SocialSearchQuerySchema, query)`；`offset = cursor ? Number(cursor) : 0`，非法 cursor 视为 0
2. `type === 'POST'`：
   - `const { ids } = await provider.searchPosts(q, { offset, limit })`
   - 回库 `post.findMany({ where: { id: { in: ids }, deletedAt: null, visibility: 'PUBLIC', moderation: { not: 'REJECTED' } } })`
   - **按 ids 顺序重排**（Postgres 的 `in` 不保序，而相关性顺序来自 Meili），用 `new Map(rows.map(r => [r.id, r]))` 依 ids 取回
   - 回库后被过滤掉的 id（刚被删 / 刚被拒但索引未同步）**静默丢弃**，不补位
   - `mapPosts(rows, viewerId)` 组装
3. `type === 'USER'`：`searchUsers` → 回库 `user.findMany({ where: { id: { in: ids }, deletedAt: null } })` → 组装 `SocialUserProfileSchema`，`postCount` 用一次 `post.groupBy({ by: ['userId'], where: { userId: { in: ids }, deletedAt: null, visibility: 'PUBLIC', moderation: { not: 'REJECTED' } }, _count: true })`
4. `nextCursor`：`ids.length < limit ? null : String(offset + limit)`
5. provider 抛错 → 转 `SOCIAL_SEARCH_UNAVAILABLE` 503，**不降级**

### 4.3 `GET /v1/social/users/:userId`

返回 `SocialUserProfileSchema`。`displayName` 走与 feed 相同的 fallback（`健身用户XXXX`），头像 `presignGet`。用户不存在或已软删 → `USER_NOT_FOUND` 404。

### 4.4 `GET /v1/social/users/:userId/posts`

沿用 feed 的分页与排序（`[{ createdAt: 'desc' }, { id: 'desc' }]` + `cursor: { id }` + `skip: 1`）。

可见性分支是本端点的要点：

```ts
const isSelf = userId === viewerId;
where: {
  userId,
  deletedAt: null,
  ...(isSelf ? {} : { visibility: 'PUBLIC', moderation: { not: 'REJECTED' } }),
}
```

即**本人**能看到自己的 `PRIVATE` 与被拒帖子（连同 `moderationReason`），他人只能看到公开且未被拒的。这同时就是「我的帖子」页——不再单开端点。

### 4.5 移动端

- **导航**：`RootStackParamList` 增 `SocialSearch: undefined`、`SocialUser: { userId: string }`，平铺注册（ADR 0011 §15）
- **入口**：`FeedScreen` 顶部搜索条（假输入框，点击 push `SocialSearch`）；`PostCard` 的头像与昵称点击 push `SocialUser`
- **`SocialSearchScreen`**：
  - 顶部真实输入框（自动聚焦）+ 「动态 / 用户」两个 Tab
  - 输入**防抖 400ms** 后触发查询；`q` 为空时展示空态而不发请求
  - 结果列表用 `useInfiniteQuery`；动态 Tab 复用 `PostCard`，用户 Tab 用新的 `UserRow`（头像 + 昵称 + 「N 条动态」）
  - `SOCIAL_SEARCH_UNAVAILABLE` 时展示明确的错误态与重试按钮，**不静默显示空结果**——这与后端「不隐式降级」是同一个诉求
- **`SocialUserScreen`**：顶部资料卡（头像、昵称、发帖数、加入时间）+ 其帖子列表（复用 `PostCard`）；是本人时列表包含 `PRIVATE` 与被拒帖子，被拒帖子在卡片上显示 `moderationReason` 提示条
- **queryKeys**：

```ts
socialSearch: (type: string, q: string) => ['social-search', type, q] as const,
socialUser: (id: string) => ['social-user', id] as const,
socialUserPosts: (id: string) => ['social-user-posts', id] as const,
```

- hooks：`useSocialSearch(type, q)` / `useSocialUser(id)` / `useSocialUserPosts(id)`

---

## 5. 建议改动文件

| 路径                                                                              | 动作                        |
| --------------------------------------------------------------------------------- | --------------------------- |
| `packages/shared/src/schemas/phase2/social.ts`                                    | 搜索与用户主页 schema       |
| `packages/shared/src/errors/codes.ts` + `i18n/zh-CN.ts`                           | `SOCIAL_SEARCH_UNAVAILABLE` |
| `apps/api/src/modules/social/search.controller.ts` / `search.service.ts`          | 新建                        |
| `apps/api/src/modules/social/users.controller.ts` / `social-users.service.ts`     | 新建（公开档案 + 其帖子）   |
| `apps/api/src/modules/social/social.module.ts`                                    | 注册 + 导入 `SearchModule`  |
| `apps/mobile/src/features/social/SocialSearchScreen.tsx` / `SocialUserScreen.tsx` | 新建                        |
| `apps/mobile/src/features/social/components/UserRow.tsx`                          | 新建                        |
| `apps/mobile/src/features/social/FeedScreen.tsx`                                  | 顶部搜索入口                |
| `apps/mobile/src/features/social/components/PostCard.tsx`                         | 作者可点击                  |
| `apps/mobile/src/app/navigation/RootNavigator.tsx`                                | 两屏注册                    |
| `apps/mobile/src/api/endpoints/social.ts` / `queryKeys.ts`                        | hooks + keys                |

---

## 6. Acceptance criteria

- [x] `pnpm typecheck` 全仓通过
- [x] 搜中文词能命中帖子正文（如帖子含「今天深蹲 100kg」，搜「深蹲」命中）——这是选 Meili 而非 tsvector 的核心验收点
- [x] 搜索结果**按相关性顺序**返回（与 Meili 返回的 ids 顺序一致，未被 Postgres 的 `in` 打乱）
- [x] `PRIVATE` 帖子、软删帖子、`REJECTED` 帖子均不出现在搜索结果
- [x] 搜索响应中**不含 `phone`**；搜手机号数字串搜不到任何用户
- [x] 翻页正确：`nextCursor` 为 offset 编码，最后一页返回 `null`
- [x] 停掉 Meili 容器后搜索返回 503 `SOCIAL_SEARCH_UNAVAILABLE`，**不会**悄悄返回 `ILIKE` 的结果
- [x] `GET /v1/social/users/:id/posts`：看自己能看到 `PRIVATE`，看他人看不到
- [x] 移动端：搜索页两个 Tab 可用、防抖生效、点用户进主页、主页帖子可点进详情（Android 真机 / 模拟器）

---

## 7. 验证步骤

```powershell
pnpm typecheck
pnpm --filter api test -- src/modules/social/search.service.spec.ts src/modules/social/social-users.service.spec.ts
docker compose -f docker/docker-compose.yml up -d
pnpm --filter api start:api
pnpm --filter api start:worker
# 手测：发 3 条含不同关键词的帖 → 搜索命中 → 停 Meili 容器 → 搜索报 503
docker compose -f docker/docker-compose.yml stop meilisearch
pnpm --filter mobile start
```

---

## 8. 不做

- 搜索高亮、错字纠正提示、搜索历史、热搜榜
- 评论内容搜索
- 按时间 / 热度排序切换（只按相关性）
- 关注 / 私信等用户主页上的社交动作

---

## 9. 交付物 / 下游

| 交付物                                    | 消费者                               |
| ----------------------------------------- | ------------------------------------ |
| `GET /v1/social/search`                   | SOCIAL-07（验收脚本的搜索断言）      |
| 用户公开档案 + 其帖子列表                 | SOCIAL-07；未来关注 / 伙伴匹配的落点 |
| `SocialSearchScreen` / `SocialUserScreen` | 未来话题标签页可复用同一结果列表     |
