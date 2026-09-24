# MEM-03 — 工具化写入：save / forget、落库队列、拆除抽取

| 字段           | 值                    |
| -------------- | --------------------- |
| **Type**       | AFK                   |
| **Wave**       | W2                    |
| **Blocked by** | [MEM-02](./MEM-02.md) |
| **Blocks**     | MEM-05、MEM-06        |
| **估时**       | 3 天                  |
| **状态**       | ⬜ 未开工             |

---

## 1. 目标

长期记忆改为 Agent 在对话中调用 `save_memory` / `forget_memory` 决定写什么。工具立即返回「已记录」，真正落库交给 `MEMORY_PERSIST` job。同时拆除每轮一次的 Pro 抽取，并把 `COACH_AGENT_ENABLED` 默认打开。

本切片结束时，记忆已经当轮可写、成本不再含抽取模型，但读取仍是 MEM-02 的 `listForPrompt` 全量注入。索引常驻和 `recall_memory` 属于 MEM-05。

---

## 2. 背景

写入今天在 [`ConversationsService.enqueueMemoryExtractSafely`](../../../apps/api/src/modules/conversations/conversations.service.ts)：SSE `done` 之后 fire-and-forget 入队，worker [`processMemoryExtract`](../../../apps/api/src/workers/ai-task.processor.ts) 调 [`extractMemoryFacts`](../../../packages/ai-core/src/memory/extract-memory-facts.ts)（DeepSeek Pro）。

`COACH_AGENT_ENABLED` 在 [`AgentConfigService`](../../../apps/api/src/config/agent-config.service.ts) 默认 false。工具名枚举在 [`CoachToolNameSchema`](../../../packages/shared/src/schemas/agent.ts)，日限在 [`COACH_TOOL_DAILY_LIMITS`](../../../packages/shared/src/constants/coach-tools.ts)。

[`extract-memory-facts.ts`](../../../packages/ai-core/src/memory/extract-memory-facts.ts) 里「何时 upsert / 何时 remove / 不要输出」是要迁走的 prompt 资产，不能随文件删除一起丢。

---

## 3. 前置阅读

1. [ADR 0012](../../adr/0012-coach-memory-tooling-and-hybrid-recall.md) §2、§6、§8
2. [`apps/api/src/domain/agent/tool-registry.service.ts`](../../../apps/api/src/domain/agent/tool-registry.service.ts)
3. [`packages/ai-core/src/graphs/coach-agent/graph.ts`](../../../packages/ai-core/src/graphs/coach-agent/graph.ts) 的 `MAX_TOOL_ITERATIONS`
4. [`apps/api/src/domain/agent/coach-agent.runner.ts`](../../../apps/api/src/domain/agent/coach-agent.runner.ts) 的 `summarizeToolResult`
5. [MEM-01](./MEM-01.md) 的 `reject_write` 样本，用来核对工具 description

---

## 4. 详细规格

### 4.1 工具契约

`CoachToolNameSchema` 增加 `save_memory`、`forget_memory`。`COACH_TOOL_LABELS_ZH` 与 progress 文案同步（「正在记下…」「正在忘掉…」）。

| 工具            | 入参                                       | 日限            |
| --------------- | ------------------------------------------ | --------------- |
| `save_memory`   | `category`、`slug`、`value`、`confidence?` | 20 / 用户自然日 |
| `forget_memory` | `key`                                      | 20 / 用户自然日 |

日限沿用现有 `ToolUsageService`（聚合当日 `toolTrace`），按客户端 `timezoneOffsetMinutes`，不要用 UTC 零点。

### 4.2 服务端校验

`ToolRegistryService` 内执行，不信任模型。失败时 observation 用中文说明原因，`ok: false`，不入队。

- `category` 必须在 `MemoryCategorySchema` 内；`slug` 走 `normalizeMemorySlug`，空则拒绝；`value` trim 后 1–512 字
- `value` 含时效词则拒绝：今天、明天、昨天、这周、本周、刚才、现在、今晚、今早。一次性身体状态（累、困、酸）写进工具 description，由模型自行不调用；服务端只硬拦时效词
- `save_memory` 命中 `isSuppressed(userId, key)` 则拒绝，observation 说明「用户已删除该记忆，不能自动恢复」
- `forget_memory` 的 key 不存在或已软删除：返回「没有这条记忆」，不算失败，不入队
- 同一轮 SSE 内 `save_memory` + `forget_memory` 合计最多 2 次成功入队，超出返回「本轮记忆写入已达上限」

### 4.3 不计入 ReAct 上限

`save_memory` 与 `forget_memory` **不增加** `graph.ts` 的 `iteration`，以免记笔记挤掉天气和 POI。实现上在 `toolsNode` 里区分：记忆工具不把 `nextIteration` 往 `MAX_TOOL_ITERATIONS` 推。单轮 2 次的限制在 ToolRegistry，不在图里。

### 4.4 立即返回 + `MEMORY_PERSIST`

工具校验通过后：

1. 向模型返回固定 observation：`已记录` 或 `已提交删除`，**不含 value**
2. 入队 `MEMORY_PERSIST`（复用 `AI_TASK_QUEUE`，`attempts: 3`，指数退避）

Job 在本切片**只做数据库**：

- `save_memory`：按 MEM-02 的复活 / CREATE / UPDATE 语义写入，`actor = AGENT`，带上 `sourceMessageId` 与 `sourceRunId`，成功后 `embeddedAt = null`
- `forget_memory`：软删除 + `DELETE` 事件，`actor = AGENT`

不要在本切片调用 embedding 或 Meili。MEM-04 会把这两步接到同一个 job 的后半段；本切片用注释标明插入点：`// MEM-04：upsert 成功后同步索引；失败不得回滚已提交的数据库写入`。

`AiTaskType` 与 Prisma `AiTaskType` 枚举增加 `MEMORY_PERSIST`。`MEMORY_EXTRACT` **保留**并在 `packages/shared/src/enums/ai-task.ts` 注释「已废弃，仅供历史 AiRun 可读」。删除 `MEMORY_EXTRACT_DAILY_LIMIT` 及 `AI_TASK_DAILY_LIMITS.MEMORY_EXTRACT`。

### 4.5 Trace 脱敏

[`coach-agent.runner.ts`](../../../apps/api/src/domain/agent/coach-agent.runner.ts) 的 `summarizeToolResult`，以及 `graph.ts` 的 `summarizeToolInput`：

- 这两个工具的 `inputSummary` / `outputSummary` 只允许 `category:key` 或「已记录 / 已提交删除 / 拒绝原因类别」
- 禁止出现 `value`、用户原话、伤病描述
- 加一条单测：summary 字符串不包含传入的 value

`Message.metadata.toolTrace` 会随会话接口返回客户端，这是安全要求，不是日志洁癖。

### 4.6 拆除抽取

删除或停止调用：

- `ConversationsService.enqueueMemoryExtractSafely` 及其在流式 / Agent 成功路径上的调用
- `AiTaskProcessor.processMemoryExtract` 与 `parseMemoryExtractInput`
- `packages/ai-core/src/memory/extract-memory-facts.ts` 的运行时导出

把该文件 system prompt 中「何时 upsert / 何时 remove / 不要输出」改写成 `save_memory` 与 `forget_memory` 的工具 description（`packages/ai-core/src/graphs/coach-agent/tools-schema.ts`），包括：稳定偏好才记、修正时复用已有 key、用户否定旧事实用 forget、不记档案里已有的身高体重、不记闲聊。对照 MEM-01 的 `reject_write` 样本通读一遍 description。

`applyPatches` 若已无调用方，可以留到本切片删除，避免死代码；审计写入改走 `MEMORY_PERSIST` 专用方法，不要复用「最多 3 条 patch」的抽取语义。

### 4.7 Flag 与失败降级

- `COACH_AGENT_ENABLED` 默认 `true`（环境变量未设置时）。`.env.example` 注释同步
- 显式 `false` 时行为与今天一致：走 `runCoachChatStream`，**不写记忆**。代码注释说明原因
- Agent 路径上，ReAct 抛错或工具循环失败时，退回 `runCoachChatStream` 生成回复，而不是整段 SSE 失败。退回路径同样不写记忆
- [`dispatchCoachChat`](../../../apps/api/src/workers/ai-task.processor.ts) 顶部注释：非流式 `COACH_CHAT` 不参与记忆写入。不要在这条路径上调用 save

### 4.8 仍注入旧记忆块

本切片不要改 `formatMemoryBlock` 的全量 value 注入。读取形态是 MEM-05 的交付。否则 MEM-03 单独上线时，模型既没有索引也没有旧块，会失去全部记忆。

---

## 5. 建议改动文件

| 路径                                                          | 动作                                      |
| ------------------------------------------------------------- | ----------------------------------------- |
| `packages/shared/src/schemas/agent.ts`                        | 两个工具名                                |
| `packages/shared/src/constants/coach-tools.ts`                | 日限与文案                                |
| `packages/shared/src/enums/ai-task.ts`                        | `MEMORY_PERSIST`；`MEMORY_EXTRACT` 标废弃 |
| `packages/shared/src/constants/limits.ts`                     | 去掉抽取日限                              |
| `packages/db/prisma/schema.prisma`                            | `AiTaskType` 增加 `MEMORY_PERSIST`        |
| `packages/ai-core/src/graphs/coach-agent/tools-schema.ts`     | 工具定义与准入 description                |
| `packages/ai-core/src/graphs/coach-agent/graph.ts`            | 记忆工具不计入 iteration                  |
| `apps/api/src/domain/agent/tool-registry.service.ts`          | 校验与入队                                |
| `apps/api/src/domain/agent/coach-agent.runner.ts`             | trace 脱敏                                |
| `apps/api/src/workers/ai-task.processor.ts`                   | `MEMORY_PERSIST`；删除抽取处理            |
| `apps/api/src/modules/conversations/conversations.service.ts` | 去掉抽取入队；失败退回纯聊天              |
| `apps/api/src/config/agent-config.service.ts`                 | 默认 true                                 |
| `packages/ai-core/src/memory/extract-memory-facts.ts`         | 删除运行时导出                            |
| `.env.example`                                                | flag 注释                                 |

---

## 6. Acceptance criteria

- [ ] 对话中说出稳定伤病（如「左肩有伤，别安排推举」）后，worker 日志出现 `MEMORY_PERSIST` 成功，库中有 `injury:*` 行与 `AGENT/CREATE` 事件
- [ ] 工具 observation 先于 job 完成返回；job 失败重试不影响当轮 SSE `done`
- [ ] 「今天有点累」「明天去杭州」不会落库（模型不调用，或调用后被时效词拒绝）
- [ ] 抑制名单上的 key，模型调用 `save_memory` 得到拒绝，行保持软删除
- [ ] 同一轮第 3 次记忆写入被拒绝；期间天气工具仍可调用（记忆写入未占满 5 次 ReAct）
- [ ] `toolTrace` 与日志中搜不到该条记忆的 value
- [ ] 全仓不再入队 `memory_extract`；历史 `AiRun.taskType = MEMORY_EXTRACT` 仍能读出
- [ ] 未设置 `COACH_AGENT_ENABLED` 时走 Agent；设为 `false` 时走纯流式且不写记忆
- [ ] Agent 工具循环抛错时，用户仍收到纯聊天回复，而不是 SSE `error`

---

## 7. 验证步骤

```powershell
pnpm --filter db migrate:dev --name memory_persist_task
pnpm --filter api test
pnpm --filter api start:worker
pnpm --filter api start:api
```

用 Coach 连续说一句稳定偏好和一句「今天累」，查 `UserAgentMemory` 与 `AiRun`（`taskType = MEMORY_PERSIST`）。再把该 key 用 SQL 标成用户删除（插 `USER/DELETE` 且 `deletedAt` 非空），重说同一事实，确认没有被复活。

---

## 8. 不做

- embedding、Meili、改 `embeddedAt`（MEM-04 接到本 job 后半段）
- 替换【长期记忆】全量注入（MEM-05）
- `recall_memory`（MEM-05）
- 用户手动 CRUD API（MEM-06）；抑制名单本切片只消费 MEM-02 的查询
- 把非流式 `dispatchCoachChat` 改成会写记忆

---

## 9. 交付物 / 下游

| 交付物                                        | 消费者                                 |
| --------------------------------------------- | -------------------------------------- |
| `MEMORY_PERSIST` job（仅 DB，留有索引插入点） | MEM-04 追加 embedding 与 Meili         |
| `save_memory` / `forget_memory` 与脱敏 trace  | MEM-05 的 Agent 工具表；MEM-06 的指标  |
| 默认开启的 Agent                              | MEM-05 的 `recall_memory` 才有执行环境 |
| 工具 description 中的准入规则                 | 与 MEM-01 `reject_write` 对照          |
