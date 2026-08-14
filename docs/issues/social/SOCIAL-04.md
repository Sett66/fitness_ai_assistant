# SOCIAL-04 — 检索基建：Meilisearch 容器 + SearchProvider + 索引队列

| 字段           | 值                          |
| -------------- | --------------------------- |
| **Type**       | AFK                         |
| **Blocked by** | [SOCIAL-01](./SOCIAL-01.md) |
| **Blocks**     | SOCIAL-05                   |
| **估时**       | 2 天                        |
| **状态**       | ⬜ 未开工                   |

---

## 1. 目标

把检索能力作为**可拆卸组件**接进来：docker-compose 增加 Meilisearch，后端封装 `SearchProvider` 接口与 meili / pg 双实现，发帖与删帖通过独立 BullMQ 队列异步同步索引，并提供全量 reindex 脚本。

本切片**不含任何面向用户的接口**——搜索 API 与 UI 在 SOCIAL-05。交付的验收方式是：发一条帖，能在 Meilisearch 里查到这条文档。

---

## 2. 背景 / 可复用基建

- 中文分词是选型主因：`to_tsvector('simple')` 整句成一个 token 不可用，`zhparser` 不在 `postgres:16-alpine` 内（ADR 0011 §8）
- `docker/docker-compose.yml` 已有 postgres / redis / minio + `minio-init` 的写法可照抄（健康检查、命名卷、自定义网络）
- `apps/api/src/infra/` 下已有 `storage` / `llm` / `geo` 等 Provider 抽象的目录范式
- `apps/api/src/infra/queue/` 已有队列常量与 `FitnessQueueModule`，但只注册了 `fitness-ai-task` 一个队列
- `env.schema.ts` 里 `LANGFUSE_*` 展示了「开关为 true 且非 test 环境时才 required」的 Joi 条件写法，本切片照抄

---

## 3. 前置阅读

1. [ADR 0011](../../adr/0011-social-feed-and-search.md) §8、§9、§10、§11（**四节都是本切片的直接依据**）
2. `docker/docker-compose.yml`、`apps/api/src/config/env.schema.ts`
3. `apps/api/src/infra/queue/queue.constants.ts`、`fitness-queue.module.ts`
4. `apps/api/src/infra/storage/s3-storage.service.ts`（Provider 实现的写法参照）
5. Meilisearch JS 客户端文档（`meilisearch` npm 包）

---

## 4. 详细规格

### 4.1 docker-compose 新增服务

在 `docker/docker-compose.yml` 的 `services` 下增加（沿用现有风格：健康检查 + 命名卷 + `fitness` 网络）：

```yaml
meilisearch:
  image: getmeili/meilisearch:latest
  container_name: fitness-meilisearch
  restart: unless-stopped
  ports:
    - '${MEILI_PORT:-7700}:7700'
  environment:
    MEILI_MASTER_KEY: ${MEILI_MASTER_KEY:-meili_dev_master_key_change_me}
    MEILI_ENV: development
    MEILI_NO_ANALYTICS: 'true'
  volumes:
    - fitness_meilidata:/meili_data
  healthcheck:
    test: ['CMD', 'curl', '-f', 'http://localhost:7700/health']
    interval: 5s
    timeout: 5s
    retries: 10
    start_period: 10s
  networks:
    - fitness
```

`volumes` 段追加 `fitness_meilidata:`。

> 镜像 tag 与 minio 保持一致用 `latest`；若要锁版本自行 pin，但需同步更新 `README.md` 的环境要求表。

### 4.2 环境变量

`.env.example`、`apps/api/.env`（本地）、`apps/api/src/config/env.schema.ts` 三处同步：

| 变量                 | 默认                    | 说明                                                                                         |
| -------------------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| `SEARCH_PROVIDER`    | `meili`                 | `meili` \| `pg`，**显式**选择实现                                                            |
| `MEILI_HOST`         | `http://127.0.0.1:7700` | 用 `127.0.0.1` 而非 `localhost`，规避 Windows 上 IPv6 解析问题（同 `DATABASE_URL` 的既有坑） |
| `MEILI_MASTER_KEY`   | —                       | 与 compose 中一致                                                                            |
| `MEILI_INDEX_PREFIX` | `fitness`               | 索引名前缀，得到 `fitness_posts` / `fitness_users`                                           |

Joi 校验照抄 `LANGFUSE_*` 的条件写法：

```ts
SEARCH_PROVIDER: Joi.string().valid('meili', 'pg').default('meili'),
MEILI_HOST: Joi.when('SEARCH_PROVIDER', {
  is: 'meili',
  then: Joi.when('NODE_ENV', {
    is: 'test',
    then: Joi.string().optional().allow('', null),
    otherwise: Joi.string().uri().required(),
  }),
  otherwise: Joi.string().optional().allow('', null),
}),
// MEILI_MASTER_KEY 同构
MEILI_INDEX_PREFIX: Joi.string().default('fitness'),
```

`EnvShape` 与 `mapEnv` 同步补齐。

### 4.3 `SearchProvider` 抽象（`apps/api/src/infra/search/`）

```
infra/search/
├── search-provider.ts        # 接口 + 文档类型 + DI token
├── meili-search.provider.ts
├── pg-search.provider.ts
└── search.module.ts          # 按 SEARCH_PROVIDER 选实现的 factory
```

```ts
export type PostSearchDoc = { id: string; userId: string; body: string; createdAtTs: number };
export type UserSearchDoc = { id: string; displayName: string };
export type SearchPage = { ids: string[]; estimatedTotal: number };

export interface SearchProvider {
  readonly name: 'meili' | 'pg';
  init(): Promise<void>; // 建索引 + 应用 settings，幂等
  indexPost(doc: PostSearchDoc): Promise<void>;
  deletePost(postId: string): Promise<void>;
  indexUser(doc: UserSearchDoc): Promise<void>;
  searchPosts(q: string, page: { offset: number; limit: number }): Promise<SearchPage>;
  searchUsers(q: string, page: { offset: number; limit: number }): Promise<SearchPage>;
  clearAll(): Promise<void>; // reindex 脚本用
}

export const SEARCH_PROVIDER = Symbol('SEARCH_PROVIDER');
```

**关键约束（ADR 0011 §9）**：`searchPosts` / `searchUsers` **只返回 id**，绝不返回展示字段。索引文档因此不含 `likeCount` / `commentCount`，点赞与评论不触发重索引。

**`MeiliSearchProvider`**

- 依赖 `meilisearch` npm 包（加到 `apps/api/package.json`）
- `init()`：`getOrCreateIndex(`${prefix}\_posts`, { primaryKey: 'id' })`，再 `updateSettings`：
  - `posts`：`searchableAttributes: ['body']`、`filterableAttributes: ['userId']`、`sortableAttributes: ['createdAtTs']`
  - `users`：`searchableAttributes: ['displayName']`
  - 中文分词由 Meilisearch 内置 charabia 处理，**无需额外配置**
- `searchPosts`：`index.search(q, { offset, limit, attributesToRetrieve: ['id'] })` → 映射出 ids
- 失败**直接抛**，由 service 转 `SOCIAL_SEARCH_UNAVAILABLE`；**严禁** catch 后转 `ILIKE`（ADR 0011 §8）

**`PgSearchProvider`**

- `indexPost` / `deletePost` / `indexUser` / `init` / `clearAll` 全部 no-op（数据本来就在库里）
- `searchPosts`：`post.findMany({ where: { deletedAt: null, visibility: 'PUBLIC', moderation: { not: 'REJECTED' }, body: { contains: q, mode: 'insensitive' } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: offset, take: limit, select: { id: true } })`
- `searchUsers`：同构，条件 `displayName: { contains: q, mode: 'insensitive' }`、`deletedAt: null`
- `estimatedTotal` 用 `offset + ids.length + (ids.length === limit ? 1 : 0)` 近似即可，本项目不展示总数

**`SearchModule`**：`useFactory` 读 `ConfigService` 的 `SEARCH_PROVIDER` 选实现，并在 `onModuleInit` 里 `await provider.init()` 且打印一行启动日志：

```
[SearchModule] 检索实现：meili（http://127.0.0.1:7700，索引前缀 fitness）
```

这行日志是排查「为什么搜不到」的第一现场，**不可省略**（ADR 0011 §8）。

### 4.4 索引同步队列

**队列常量**（`apps/api/src/infra/queue/queue.constants.ts`）：

```ts
export const SOCIAL_INDEX_QUEUE_NAME = 'fitness-social-index';
export const SOCIAL_INDEX_JOB_NAME = 'default';

export type SocialIndexJobPayload =
  | { op: 'INDEX_POST'; id: string }
  | { op: 'DELETE_POST'; id: string }
  | { op: 'INDEX_USER'; id: string };
```

**注册**：`FitnessQueueModule` 增注册第二个队列并导出；`WorkerRootModule` 的 providers 增 `SocialIndexProcessor`，imports 增 `SearchModule`。

**Processor**（`apps/api/src/workers/social-index.processor.ts`）：

```ts
@Processor(SOCIAL_INDEX_QUEUE_NAME)
export class SocialIndexProcessor extends WorkerHost {
  async process(job: Job<SocialIndexJobPayload>): Promise<void> {
    // INDEX_POST：回库读 post，若已软删 / PRIVATE / REJECTED → 改为 deletePost
    // DELETE_POST：provider.deletePost(id)
    // INDEX_USER：回库读 user.displayName（为空则用 fallback 昵称）
  }
}
```

要点：

- **回库取最新状态**再决定索引还是删除，不信任 payload 里的旧值——这让重复消费与乱序消费都安全（幂等）
- 抛错交给 BullMQ 按现有退避重试，不要吞异常
- `SEARCH_PROVIDER=pg` 时 processor 照常消费，只是 provider 的方法是 no-op

**入队点**（`apps/api/src/modules/social/posts.service.ts`）：

| 时机                              | job           |
| --------------------------------- | ------------- |
| 发帖成功后                        | `INDEX_POST`  |
| 软删帖子后                        | `DELETE_POST` |
| （SOCIAL-06）审核判 `REJECTED` 后 | `DELETE_POST` |

**必须在事务提交之后入队**，不能放在 `$transaction` 回调内——否则事务回滚了任务却已经发出。

昵称变更的 `INDEX_USER` 入队点在 `apps/api/src/modules/users/users.service.ts` 更新 `displayName` 的分支。

### 4.5 全量 reindex 脚本

`apps/api/src/scripts/reindex-social.ts`，用 `NestFactory.createApplicationContext` 起一个最小上下文（参照 `worker.ts` 的 bootstrap 写法）：

1. `provider.init()` → `provider.clearAll()`
2. 分批（每批 500）扫 `post.findMany({ where: { deletedAt: null, visibility: 'PUBLIC', moderation: { not: 'REJECTED' } }, orderBy: { id: 'asc' }, cursor })` → `indexPost`
3. 分批扫 `user.findMany({ where: { deletedAt: null } })` → `indexUser`
4. 打印统计并 `process.exit(0)`

`apps/api/package.json` 增 `"reindex:social": "tsx src/scripts/reindex-social.ts"`（若仓库用 ts-node 则按现有 scripts 风格对齐）。

这是索引漂移与 Meili 数据卷丢失后的**唯一**恢复路径（ADR 0011 §10）。

### 4.6 文档同步

`README.md` 的「一次性初始化」与「环境前置要求」补一句 Meilisearch；`docker compose up -d` 命令本身不变。

---

## 5. 建议改动文件

| 路径                                               | 动作                                         |
| -------------------------------------------------- | -------------------------------------------- |
| `docker/docker-compose.yml`                        | 新增 meilisearch 服务 + 命名卷               |
| `.env.example`                                     | 4 个新变量                                   |
| `apps/api/src/config/env.schema.ts`                | Joi 校验 + `EnvShape` + `mapEnv`             |
| `apps/api/package.json`                            | `meilisearch` 依赖 + `reindex:social` script |
| `apps/api/src/infra/search/`                       | 新建接口 + 双实现 + module                   |
| `apps/api/src/infra/queue/queue.constants.ts`      | 索引队列常量 + payload 类型                  |
| `apps/api/src/infra/queue/fitness-queue.module.ts` | 注册第二个队列                               |
| `apps/api/src/workers/social-index.processor.ts`   | 新建                                         |
| `apps/api/src/worker.root.module.ts`               | 注册 processor + `SearchModule`              |
| `apps/api/src/modules/social/posts.service.ts`     | 发帖 / 删帖后入队                            |
| `apps/api/src/modules/users/users.service.ts`      | 昵称变更后入队 `INDEX_USER`                  |
| `apps/api/src/scripts/reindex-social.ts`           | 新建                                         |
| `README.md`                                        | 环境要求 + 初始化说明                        |

---

## 6. Acceptance criteria

- [ ] `docker compose -f docker/docker-compose.yml up -d` 后 `http://127.0.0.1:7700/health` 返回 available
- [ ] `pnpm typecheck` 全仓通过；CI（无 Meili 容器）仍绿
- [ ] API 与 worker 启动日志各打印一行当前检索实现
- [ ] 发一条帖 → 数秒后在 Meili 中能查到该文档（`curl` 或 Meili 控制台核验），字段**只有** `id` / `userId` / `body` / `createdAtTs`
- [ ] 删除该帖 → 文档从索引消失
- [ ] 点赞 / 评论该帖**不产生**任何索引任务（观察 worker 日志）
- [ ] 停掉 Meili 容器后发帖仍成功（HTTP 200），worker 日志显示索引任务重试
- [ ] `SEARCH_PROVIDER=pg` 时全链路不报错，索引任务变为 no-op
- [ ] `pnpm --filter api reindex:social` 能在清空索引后完整重建，打印重建条数

---

## 7. 验证步骤

```powershell
docker compose -f docker/docker-compose.yml up -d
pnpm --filter api start:api      # 观察 [SearchModule] 日志行
pnpm --filter api start:worker
# 发帖后核验索引（替换 master key）
curl -H "Authorization: Bearer meili_dev_master_key_change_me" "http://127.0.0.1:7700/indexes/fitness_posts/search?q=深蹲"
pnpm --filter api reindex:social
```

---

## 8. 不做

- 搜索 API 与移动端搜索页（SOCIAL-05）
- 评论内容入索引（ADR 0011 §9 只索引帖子正文与用户昵称）
- 搜索高亮、拼写纠错提示、搜索历史、热搜词
- Meili 的多语言 / 同义词 / 停用词调优

---

## 9. 交付物 / 下游

| 交付物                                  | 消费者                                       |
| --------------------------------------- | -------------------------------------------- |
| `SearchProvider` + 双实现 + DI token    | SOCIAL-05（搜索 service 注入）               |
| `fitness-social-index` 队列 + processor | SOCIAL-06（`REJECTED` 后入队 `DELETE_POST`） |
| `reindex:social` 脚本                   | SOCIAL-07（seed 后重建索引）                 |
| Meilisearch 容器 + env                  | 全 Epic 本地环境                             |
