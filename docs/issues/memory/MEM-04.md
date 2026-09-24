# MEM-04 — 检索基建：embedding、Meili 记忆索引与隔离查询

| 字段           | 值                    |
| -------------- | --------------------- |
| **Type**       | AFK                   |
| **Wave**       | W3a                   |
| **Blocked by** | [MEM-02](./MEM-02.md) |
| **Blocks**     | MEM-05                |
| **估时**       | 2–3 天                |
| **状态**       | ⬜ 未开工             |

---

## 1. 目标

把长期记忆同步进 Meilisearch 混合索引，并提供一个**只能按 userId 检索**的封装。本切片不改 Coach prompt，也不注册 `recall_memory`。验收方式是：写入一条记忆后，能在该用户的索引里查到，另一个用户查不到。

MEM-03 若尚未合并，本切片仍可先做 client、索引和 `reindex:memories`。接入 `MEMORY_PERSIST` 后半段时，若 job 还不存在，就只保证 reindex 脚本与 `indexMemory` / `removeMemory` 方法可用，并在 PR 里注明等待 MEM-03 的插入点。

---

## 2. 背景

社区检索已经在 [`apps/api/src/infra/search/`](../../../apps/api/src/infra/search/)：`SearchProvider` 管帖子和用户，索引名 `${MEILI_INDEX_PREFIX}_posts`。那个接口的 `search(q, page)` 没有强制租户过滤，**不能**直接拿来查记忆。

Meili 镜像当前是 `getmeili/meilisearch:latest`（[`docker/docker-compose.yml`](../../../docker/docker-compose.yml)）。hybrid 与 embedder 对版本敏感，本切片要 pin tag。

DashScope key 已为 Qwen-VL 配置（`DASHSCOPE_API_KEY`，OpenAI 兼容 base URL）。embedding 用 `text-embedding-v3`，1024 维，不新增供应商。

---

## 3. 前置阅读

1. [ADR 0012](../../adr/0012-coach-memory-tooling-and-hybrid-recall.md) §4
2. [`apps/api/src/infra/search/meili-search.provider.ts`](../../../apps/api/src/infra/search/meili-search.provider.ts)（动态 import、`waitTask`、索引创建）
3. [`apps/api/src/scripts/reindex-social.ts`](../../../apps/api/src/scripts/reindex-social.ts)
4. [`packages/ai-core/src/llm/qwen-vl.ts`](../../../packages/ai-core/src/llm/qwen-vl.ts)（同一 base URL 与 key 的客户端写法）
5. MEM-03 §4.4 的 job 插入点注释

---

## 4. 详细规格

### 4.1 镜像版本

`docker/docker-compose.yml` 的 meilisearch `image` 从 `latest` 改为支持 hybrid search 与 `userProvided` embedder 的**具体 tag**（实施时查 Meili 文档，选定后写进 compose 与本文件验收记录）。不要继续用 `latest`。

改 tag 后本地需要重建容器。帖子索引的 settings 由 `MeiliSearchProvider.init()` 重放，确认社区搜索仍可用。

### 4.2 Embedding client

`packages/ai-core/src/llm/` 增加 `createEmbeddingClient`，走现有 DashScope 兼容端点 `/embeddings`，模型 `text-embedding-v3`，维度 1024。

- 输入：一条文本（记忆用 `key + "\n" + value`，查询用用户 query）
- 失败抛现有 `AiCoreError`，不要吞掉
- 不把 key 打进日志

### 4.3 索引

新索引 `${MEILI_INDEX_PREFIX}_memories`，primaryKey = 记忆 `id`。

| 设置                 | 值                                                            |
| -------------------- | ------------------------------------------------------------- |
| searchableAttributes | `value`、`key`                                                |
| filterableAttributes | `userId`、`category`                                          |
| embedder             | 名称 `memory`，`source: userProvided`，`dimensions: 1024`     |
| 文档字段             | `id`、`userId`、`key`、`category`、`value`、`_vectors.memory` |

文档里的 `value` 只存在于 Meili，不进应用日志。软删除的记忆必须 `deleteDocument`，不能留在索引里。

### 4.4 `MemorySearchProvider`

新建，不要扩展 `SearchProvider.searchPosts` 的签名。

```ts
search(userId: string, query: string, options?: { category?: MemoryCategory; limit?: number }): Promise<MemoryHit[]>
index(doc: MemoryIndexDoc): Promise<void>
remove(memoryId: string): Promise<void>
```

`search` 内部拼接 `filter: userId = "<id>"`（category 有则 AND）。参数列表里没有 filter 字符串，调用方无法省略 userId。`limit` 默认 5，最大 5。

`semanticRatio` 初值 0.5，集中在一个常量 `MEMORY_HYBRID_SEMANTIC_RATIO`，MEM-05 只改这个常量。hybrid 请求按 Meili 当前版本文档的 `hybrid: { embedder, semanticRatio }` 发送，查询向量由本进程先算好再传入（embedder 为 userProvided）。

### 4.5 接到 `MEMORY_PERSIST`

MEM-03 的 job 在数据库 upsert 成功之后：

1. 算 embedding
2. `index` 或 `remove`（forget 走 remove）
3. 成功则把 `embeddedAt` 设为当前时间

索引或 embedding 失败：**不回滚数据库**，`embeddedAt` 保持 `null`，job 按 BullMQ 重试。重试时数据库 upsert 必须幂等（同一 `userId+key` 不产生第二行，MEM-02 已保证）。

若 MEM-03 尚未合并，本方法先被 reindex 脚本使用，合并后补上 job 后半段，不另起队列。

### 4.6 `reindex:memories`

照 `reindex-social.ts`：扫 `deletedAt = null` 的全部记忆，批量 embedding + index；扫 `deletedAt != null` 的 id 并从索引删除。`package.json` 增加 `reindex:memories` script。

这同一条路径也是 `embeddedAt is null` 的 backfill，不需要第二个 job。

### 4.7 失败与空

embedding 未配置（无 `DASHSCOPE_API_KEY`）时，`index` 抛明确错误，reindex 脚本非 0 退出。不要静默写成零向量。

---

## 5. 建议改动文件

| 路径                                                       | 动作                                   |
| ---------------------------------------------------------- | -------------------------------------- |
| `docker/docker-compose.yml`                                | pin Meili tag                          |
| `packages/ai-core/src/llm/embedding.ts`                    | 新建                                   |
| `packages/ai-core/src/index.ts`                            | 导出                                   |
| `apps/api/src/infra/search/memory-search.provider.ts`      | 新建                                   |
| `apps/api/src/infra/search/search.module.ts`               | 注册                                   |
| `apps/api/src/workers/ai-task.processor.ts`                | `MEMORY_PERSIST` 后半段（依赖 MEM-03） |
| `apps/api/src/scripts/reindex-memories.ts`                 | 新建                                   |
| `apps/api/package.json`                                    | `reindex:memories`                     |
| `apps/api/src/infra/search/memory-search.provider.spec.ts` | filter 必带 userId                     |

---

## 6. Acceptance criteria

- [ ] compose 中 Meili 镜像是具体 tag，不是 `latest`
- [ ] `reindex:memories` 后，未删除记忆的 `embeddedAt` 非空，Meili 文档数与之相符
- [ ] 用户 A 的 query 只返回 A 的记忆；用 A 的记忆原文作为 query，用户 B 的结果为空
- [ ] 软删除后索引中不再有该 `id`
- [ ] `MemorySearchProvider.search` 的类型上不存在调用方可控的 filter 参数
- [ ] embedding 失败时数据库行仍在，`embeddedAt` 仍为 null，job 会重试
- [ ] 社区帖子搜索在换 tag 后仍能返回结果

---

## 7. 验证步骤

```powershell
docker compose -f docker/docker-compose.yml up -d meilisearch
pnpm --filter api reindex:memories
pnpm --filter api test -- memory-search
```

用两名 seed 用户各写一条不同记忆（可直接 SQL），分别 search，核对命中 id。删掉其中一条后再 search，确认消失。

---

## 8. 不做

- `recall_memory` 工具、prompt 块、`semanticRatio` 调参（MEM-05）
- pgvector、更换 Postgres 镜像
- 修改 `SearchProvider` 的帖子/用户方法
- 记忆 value 加密
- 在日志或脚本 stdout 打印完整 value（脚本只打 id、key、计数）

---

## 9. 交付物 / 下游

| 交付物                         | 消费者                               |
| ------------------------------ | ------------------------------------ |
| `MemorySearchProvider.search`  | MEM-05 `recall_memory`               |
| `MEMORY_HYBRID_SEMANTIC_RATIO` | MEM-05 按 golden set 修改            |
| `reindex:memories`             | 运维与 MEM-05 评测前的索引准备       |
| job 后半段的索引写入           | 与 MEM-03 的落库组成一次完整 persist |
