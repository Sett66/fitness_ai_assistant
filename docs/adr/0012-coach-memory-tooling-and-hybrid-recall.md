# 0012 — Coach 记忆系统：工具化写入、记忆索引常驻与 Meili 混合召回

## Context

ADR [0008](./0008-coach-agent-tools-and-memory.md) §3 交付了三层记忆：工作记忆（会话内最近消息）、情景记忆（`UserAiContext`）、长期记忆（`UserAgentMemory`）。长期记忆的写入是 `COACH_CHAT` 成功后异步 `memory_extract` job（DeepSeek Pro 抽取 `AgentMemoryPatch[]`），读取是「按 `updatedAt` 降序取 20 条全量注入 system prompt」。

运行一段时间后暴露以下问题：

- **key 空间漂移**：`key` 由 LLM 自由发明而 `(userId, key)` 是主键，`injury_shoulder` 与 `left_shoulder_injury` 可并存，`remove` 删不干净；抽取时只把最近 20 条事实喂回模型，超出部分模型看不见，必然另起新 key
- **召回无相关性**：永久按时间取 20 条，`confidence` 查出但不参与排序；第 21 条之后的记忆事实上永久沉默，却继续占存储
- **写入成本与时效**：每轮对话无条件跑一次 Pro 模型抽取；记忆在下一轮才生效
- **无审计、无纠错**：`remove` 是硬删，`sourceMessageId` 每次 upsert 被覆盖；没有任何面向用户的记忆管理接口，一条被误抽的记忆（如把「我朋友膝盖不好」记成用户的）会永久污染后续对话且无从修正
- **并发重复**：抽取 job 并发，用户连发消息时两个 job 读到同一份 `existingFacts`，天然产生语义重复
- **日界不一致**：`MEMORY_EXTRACT` 日限按 UTC 零点重置，与 `COACH_CHAT` 的用户时区口径不一致

本 ADR 重新设计长期记忆的写入、存储、召回与治理。工作记忆与情景记忆的机制不变。

## Decision

### 1. 数据模型：类别 schema、软删除、审计事件

**key 结构**：`key = "<category>:<slug>"`，`category` 取自白名单枚举，`slug` 为 snake_case、≤48 字符。服务端用 Zod 硬校验，非白名单 category 直接拒绝写入。

| category           | 含义                     | 安全关键 |
| ------------------ | ------------------------ | -------- |
| `injury`           | 伤病与身体活动限制       | 是       |
| `diet_restriction` | 过敏、忌口、医嘱饮食限制 | 是       |
| `diet_pref`        | 饮食偏好（非限制）       | 否       |
| `equipment`        | 可用器械与训练场地条件   | 否       |
| `schedule`         | 可训练时段、周频率       | 否       |
| `location`         | 常驻城市、常出差城市     | 否       |
| `goal_note`        | 目标相关的稳定补充说明   | 否       |
| `other`            | 不属于以上类别的稳定事实 | 否       |

**`UserAgentMemory` 结构变更**：

- 主键改为独立 `id`（cuid），保留 `@@unique([userId, key])`
- 新增 `category`（枚举）、`deletedAt`（软删除）、`lastUsedAt`、`hitCount`、`embeddedAt`（embedding 是否已同步）
- 软删除的行保留；同 key 再次写入时复活该行（`update value, deletedAt = null`），因此唯一约束不冲突

**新增 `UserAgentMemoryEvent`（append-only 审计表）**：`memoryId`、`action`（`CREATE` / `UPDATE` / `DELETE` / `RESTORE`）、`valueSnapshot`、`actor`（`AGENT` / `USER` / `SYSTEM`）、`sourceRunId?`、`sourceMessageId?`、`createdAt`。

**抑制名单**：`actor = USER` 且 `action = DELETE` 的 key 进入抑制名单，Agent **不得自动重建**；仅当用户通过记忆管理接口手动新增或编辑时才恢复。用户的纠错必须优于模型的判断。

### 2. 写入：Agent 工具化，移除后台抽取

新增两个 `CoachToolName`：

| 工具            | 入参                                       | 行为                                |
| --------------- | ------------------------------------------ | ----------------------------------- |
| `save_memory`   | `category`, `slug`, `value`, `confidence?` | 新增或更新一条长期记忆              |
| `forget_memory` | `key`                                      | 软删除一条长期记忆（`actor=AGENT`） |

**服务端校验**（工具层，不信任模型输出）：

- `category` 必须在白名单内；`slug` 规范化为 snake_case 且 ≤48 字符；`value` ≤512 字符
- 含时效词（今天、明天、这周、刚才、现在等）的 `value` 一律拒绝——这类信息属于工作记忆，不得进入长期记忆
- 命中抑制名单的 key 拒绝写入
- 单轮对话最多 2 次记忆写入；记忆类工具**不计入** `MAX_TOOL_ITERATIONS`（单独计数），避免记笔记挤占天气/POI 的调用额度

**执行语义**：工具在服务端 fire-and-forget——立即向模型返回「已记录」，同时入队 `MEMORY_PERSIST` job 完成「upsert → 算 embedding → 写 Meili 索引」三步。队列保留是为了重试（`attempts: 3`）、失败留存与 Langfuse 观测；被省掉的是原方案里那次 Pro 模型抽取调用，而非可靠性。

副作用：工具返回成功不代表已落库。可接受，因为下一轮注入的记忆索引来自真实数据，模型不会凭空声称记得不存在的事实。

**Trace 脱敏（安全要求）**：`toolTrace` 会写入 `Message.metadata`，而 `Message` 随 `GET /v1/conversations` 原样返回客户端。记忆类工具的 `inputSummary` / `outputSummary` **只记 `category:key`，禁止记录 `value`**，与 0008 §5 对坐标的脱敏要求同源。

**移除**：`memory_extract` job、`processMemoryExtract`、`extractMemoryFacts`、`MEMORY_EXTRACT_DAILY_LIMIT`。`AiTaskType.MEMORY_EXTRACT` 枚举值**保留并标注废弃**（历史 `AiRun` 行仍需可读）；新增 `MEMORY_PERSIST`。原抽取 prompt 中「何时 upsert / 何时 remove / 不要记什么」的规则迁移到 `save_memory` 的工具 description，不得丢弃。

### 3. 读取：记忆索引常驻 + `recall_memory` 按需展开

system prompt 不再全量注入记忆 value，改为两段：

- **【记忆索引】**：常驻，只列 `category:key`（不含 value），上限 60 条，安全类别优先。成本约一百余 token，作用是让模型始终知道「存在哪些记忆」，从而在需要时主动检索——这是召回的下限保证
- **【安全记忆】**：`injury` 与 `diet_restriction` 两个安全关键类别，最多 5 条**直接注入 value**。理由见 Consequences：这两类记忆的漏召回会导致危险的训练或饮食建议，不能依赖模型的检索判断

新增工具：

| 工具            | 入参                 | 行为                                            |
| --------------- | -------------------- | ----------------------------------------------- |
| `recall_memory` | `query`, `category?` | 按语义 + 关键词混合检索当前用户记忆，返回 top-5 |

模型自己发出的 `query` 即承担了查询改写的职责，因此不需要额外一次 LLM 调用来改写。命中记忆的 `lastUsedAt` / `hitCount` 异步更新，供后续衰减淘汰使用。

### 4. 检索基建：复用 Meilisearch 混合检索

不引入 pgvector。理由：现有 `getmeili/meilisearch` 已在运行，`SearchProvider` 接口已预留双后端；Meili 的 hybrid search 是 BM25 与向量的融合，其关键词部分恰好补偿纯向量在「语义不相似但领域相关」场景下的失效；而 pgvector 需要更换 Postgres 镜像（`postgres:16-alpine` 不含该扩展）、手写 migration，且 Prisma 5.22 无原生 vector 类型，KNN 必须走 `$queryRaw`。

| 项           | 决定                                                                            |
| ------------ | ------------------------------------------------------------------------------- |
| 索引         | `${MEILI_INDEX_PREFIX}_memories`，primaryKey = 记忆 `id`                        |
| 可搜索字段   | `value`、`key`                                                                  |
| 可过滤字段   | `userId`、`category`                                                            |
| embedder     | `userProvided`，dimensions 1024；向量由 API 进程算好随文档写入                  |
| embedding 源 | DashScope `text-embedding-v3`，复用现有 `DASHSCOPE_API_KEY`（Qwen-VL 同一凭据） |
| 融合比例     | `semanticRatio` 初值 0.5，由 golden set 调优                                    |
| 镜像版本     | Meili 镜像从 `latest` **固定到具体 tag**；hybrid/embedder 是版本敏感特性        |

**多租户隔离（安全红线）**：记忆索引存放私密健康数据，与公开的 `_posts` 索引性质不同。检索必须封装为 `MemorySearchProvider.search(userId, query, options)`，内部强制拼接 `userId` 过滤，**不向调用方暴露裸 filter 参数**。任何一次遗漏都是跨用户信息泄漏。

**一致性**：Postgres 是唯一真源，Meili 是派生索引。软删除的记忆同步从索引移除；`embeddedAt` 为空的记忆由 backfill job 补算；新增 `reindex:memories` 脚本（照 `reindex-social.ts` 模式）。

**降级**：Meili 或 embedding 不可用时，`recall_memory` 退回「按 `updatedAt` 取 20 条」的旧行为，保证记忆系统不因检索基建故障而整体失效。

### 5. 用户可控

| 端点                               | 行为                                   |
| ---------------------------------- | -------------------------------------- |
| `GET /v1/users/me/memories`        | 按 category 分组列出（不含软删除）     |
| `POST /v1/users/me/memories`       | 用户手动新增（可解除抑制名单）         |
| `PATCH /v1/users/me/memories/:id`  | 用户编辑 value                         |
| `DELETE /v1/users/me/memories/:id` | 软删除并写入抑制名单（`actor = USER`） |

移动端提供「教练记得什么」页面。用户删除行为是记忆质量唯一的真实负反馈信号，经审计表回流为评估样本。

### 6. Agent flag 与降级策略

- `COACH_AGENT_ENABLED` 默认改为 `true`（记忆写入与召回均依赖工具，flag 关闭等于记忆系统失效）
- 取代 0008 §1 的「整体 flag 回退到 M4 行为」：改为**细粒度降级**——ReAct 循环内工具调用连续失败时，退回纯聊天流式回答，而非关闭整个 Agent
- 非流式 `COACH_CHAT` 路径（`postMessage` → worker）**不参与记忆写入**，代码中显式注明；该路径目前无客户端调用方

### 7. 评估与观测

- **golden set**：≥20 条 `(对话场景 → 应召回的 key 集合)` 人工样本，重点覆盖「语义不相似但必须召回」的场景（练胸 → 肩伤、跑步 → 膝伤、增肌方案 → 乳糖不耐）。它是 `semanticRatio`、top-k 与工具准入 prompt 调优的前提，必须先于召回实现
- **线上指标**（Langfuse）：`save_memory` 调用率与服务端拒绝率（误触发）、`recall_memory` 调用率与命中率（模型是否真的会用）、用户删除率（真实负反馈）、golden set 上的 P@k

### 8. 日限与成本

| 工具            | 日限/用户 |
| --------------- | --------- |
| `save_memory`   | 20        |
| `forget_memory` | 20        |
| `recall_memory` | 50        |

工具日限沿用 0008 §6 的实现方式（聚合当日 `AiRun.outputJson.toolTrace` 计数），按用户时区自然日。embedding 调用量 = 记忆写入次数 + `recall_memory` 次数。

### 9. 明确不做

- pgvector 或独立向量数据库
- 会话滚动摘要、全量对话摘要入库（工作记忆改造另行评估）
- 记忆的跨用户共享、记忆导出
- 记忆 value 的静态加密（仅要求传输、日志与 toolTrace 脱敏）
- 独立的 query 改写 LLM 调用（由 `recall_memory` 的模型自选 query 承担）

## Consequences

**正面**

- key 空间可枚举，重复与漂移在写入层被硬拦；`remove` 语义可靠
- 记忆写入不再需要每轮一次 Pro 模型调用，成本显著下降，且记忆当轮即生效
- 召回既有下限（记忆索引常驻 + 安全类 value 常驻）又有相关性（hybrid 检索），且不增加首字节前的延迟
- 审计表 + 软删除 + 用户纠错构成闭环：误记可被用户删除，删除行为回流为评估负样本
- 复用已有 Meili 与 DashScope 凭据，零新增基础设施依赖

**负面**

- `COACH_AGENT_ENABLED` 默认开启后，所有用户承担 ReAct 的延迟与 token 成本，0008 的整体回退保险不再存在
- `recall_memory` 引入一次额外工具往返（仅在模型判断需要记忆时发生）
- Agent system prompt 继续膨胀（新增 3 个工具及其准入规则），与【当前时间】导致的 prefix cache 失效叠加
- Meili 成为记忆召回的运行时依赖，需要 reindex 与一致性维护；派生索引与真源可能短暂不一致
- `save_memory` fire-and-forget 意味着工具返回成功不等于已落库

**关于安全类记忆的收紧**：本 ADR 在「记忆索引常驻 + `recall_memory`」之外，额外要求 `injury` 与 `diet_restriction` 的 value 直接常驻注入。纯检索方案（无论是向量还是模型自选 query）对这两类记忆只能提供概率性召回，而漏召回的后果是给出可能造成伤害的建议；这两类记忆通常不超过 5 条，直接注入的 token 代价可忽略。安全相关的召回不接受概率保证。

**对 0008 的取代**

| 0008 章节 | 状态                                                                     |
| --------- | ------------------------------------------------------------------------ |
| §1        | `COACH_AGENT_ENABLED` 默认值与整体回退策略由本 ADR §6 取代               |
| §3        | 长期记忆的写入与读取机制由本 ADR §2、§3、§4 取代；工作记忆与情景记忆不变 |
| §9        | 「不做向量记忆」由本 ADR §4 取代（限定为 Meili hybrid，仍不做 pgvector） |

0008 的工具执行架构（`ToolRegistry`、`CoachAgentRunner`、SSE 契约、卡片确认、`enqueue_*` 重任务边界）**继续有效**。

## 实施分期

细节在 [`docs/issues/memory/`](../issues/memory/README.md)。W3 拆成检索基建与对话接入两片，MEM-03 与 MEM-04 只阻塞于 MEM-02，可以并行。

| Wave | 切片   | 交付                                                                                                           |
| ---- | ------ | -------------------------------------------------------------------------------------------------------------- |
| W0   | MEM-01 | golden set（≥20 条）                                                                                           |
| W1   | MEM-02 | 类别 schema、软删除、审计表、抑制名单的 Prisma 迁移与数据回填；校验层单测                                      |
| W2   | MEM-03 | `save_memory` / `forget_memory`、服务端校验、`MEMORY_PERSIST`（仅落库）、trace 脱敏、移除抽取旁路、flag 默认开 |
| W3a  | MEM-04 | embedding client、Meili 记忆索引与隔离封装、`reindex:memories`                                                 |
| W3b  | MEM-05 | 【记忆索引】+【安全记忆】prompt 块、`recall_memory`、降级、用 golden set 调 `semanticRatio`                    |
| W4   | MEM-06 | 用户记忆管理 API、移动端「教练记得什么」、Langfuse 指标                                                        |

W2 结束时系统已可用且成本已降低，W3 为纯增量——若 hybrid 召回效果不及「索引常驻 + recall」，可仅保留后者。

## References

- ADR 0007（Coach 会话）、0008（Agent 工具与分层记忆）、0010（Langfuse 观测）、0011（社区检索与 Meili 基建）
- `packages/ai-core/src/memory/`、`apps/api/src/domain/agent-memory.service.ts`
- `apps/api/src/infra/search/`（`SearchProvider` 抽象与 Meili provider）
- [`docs/issues/memory/README.md`](../issues/memory/README.md)（分切片实施文档）

## Status

Proposed · 2026-09-24
