# AGENT-05 — 长期记忆：UserAgentMemory 读写

| 字段           | 值                                                   |
| -------------- | ---------------------------------------------------- |
| **Type**       | AFK                                                  |
| **Wave**       | W1                                                   |
| **Blocked by** | [AGENT-01](./AGENT-01.md), [AGENT-02](./AGENT-02.md) |
| **Blocks**     | AGENT-06                                             |
| **估时**       | 2–3 天                                               |
| **状态**       | ✅ Done（2026-06-14）                                |

---

## 1. 目标

实现 **跨会话长期记忆**：数据库存储 + 读取注入 prompt + 对话成功后**异步抽取**。

AGENT-06 的 Agent 应能在 system prompt 中看到「【长期记忆】」块；本 Issue 可先用手工 seed 验证读取，再接通抽取 job。

---

## 2. 背景

| 记忆层   | 现状                   | 本 Issue                    |
| -------- | ---------------------- | --------------------------- |
| 工作记忆 | Message history ~10 条 | 不改动（AGENT-06 可调上限） |
| 情景记忆 | `UserAiContext`        | 不改动                      |
| 长期记忆 | 无                     | **新增** `UserAgentMemory`  |

抽取场景示例：用户说「我膝盖不好不要用深蹲」→ `key: injury_knee`, `value: 避免深蹲类动作`。

---

## 3. 前置阅读

1. ADR 0008 § 记忆三层
2. [`packages/ai-core/src/chains/coach-chat/context.ts`](../../../packages/ai-core/src/chains/coach-chat/context.ts)
3. [`apps/api/src/workers/ai-task.processor.ts`](../../../apps/api/src/workers/ai-task.processor.ts)（BullMQ 模式）
4. [`packages/db/prisma/schema.prisma`](../../../packages/db/prisma/schema.prisma)

---

## 4. 详细规格

### 4.1 Prisma 模型

```prisma
model UserAgentMemory {
  userId           String
  key              String   @db.VarChar(64)
  value            String   @db.VarChar(512)
  confidence       Float    @default(0.8)
  sourceMessageId  String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user User @relation(...)
  @@id([userId, key])  // 或 @@unique([userId, key])
  @@index([userId, updatedAt])
}
```

运行 `pnpm --filter db migrate:dev --name user_agent_memory`。

### 4.2 读取：`AgentMemoryService`

位置建议：`apps/api/src/domain/agent-memory.service.ts`

```ts
async listForPrompt(userId: string, limit = 20): Promise<AgentMemoryFact[]>
// orderBy updatedAt desc
```

### 4.3 格式化：`formatMemoryBlock`

位置：`packages/ai-core/src/memory/format-memory-block.ts`（ARCHITECTURE 占位）

输入 `AgentMemoryFact[]`，输出中文纯文本，例如：

```
【长期记忆】
- injury_knee: 避免深蹲类动作
- travel_city: 常出差上海
```

无事实时返回空字符串（不占 token）。

### 4.4 注入点（本 Issue 可先接旧路径）

在 **AGENT-06 之前**，可临时接入 `runCoachChatStream` 的 system prompt 拼接，便于验收：

```
${COACH_STREAM_SYSTEM_PROMPT}
${memoryBlock}
【用户上下文】
${contextBlock}
```

AGENT-06 改为 Agent Runner 同一拼接逻辑。**勿重复实现两处**——抽 `buildCoachSystemPrompt({ memory, userContext })` 共享。

### 4.5 异步抽取

#### 触发时机

`postMessageStream` 在 `status: DONE` 更新 `AiRun` **之后**，入队低优先级 job：

- 队列名：可复用 `AI_TASK_QUEUE` 新 job name `memory_extract` **或** 专用 `AGENT_MEMORY_QUEUE`（ADR 若未规定，选简单方案并写注释）

#### Job payload

```ts
{
  (userId, conversationId, userMessageId, assistantMessageId, latestUserText, assistantReply);
}
```

#### 处理逻辑 `extractMemoryFacts`

- 调用 DeepSeek **单次** `generateJson`，prompt 要求输出 `{ patches: AgentMemoryPatch[] }`，最多 3 条/轮
- patch：`action: upsert | remove`；`confidence ≥ 0.6` 时执行（`AgentMemoryService.applyPatches`）
- 用户明确否定旧记忆 → `remove`；修正/补充 → 同 key `upsert`；模糊表述（如「好像恢复了」）→ 通常 `upsert` 更新 value
- 失败：打日志，**不**改 Assistant Message 状态

#### 队列实现（已落地）

- 复用 `AI_TASK_QUEUE`，job 名 `memory_extract`（低优先级）
- 创建 `AiTaskType.MEMORY_EXTRACT` 的 `AiRun` 记录，用于日限统计与审计

#### 日限

每用户每 day 最多抽取 N 次（如 30，与 COACH_CHAT 同量级），防刷。

### 4.6 Seed（验收用，可选）

`packages/db/prisma/seed.ts` 可为 demo 用户（`13800138000`）写入示例记忆。**验收以对话抽取为准**，seed 非必须。

---

## 5. 建议改动文件

| 路径                                                                     | 动作              |
| ------------------------------------------------------------------------ | ----------------- |
| `packages/db/prisma/schema.prisma`                                       | UserAgentMemory   |
| `packages/db/prisma/migrations/*`                                        | 新 migration      |
| `apps/api/src/domain/agent-memory.service.ts`                            | 新建              |
| `packages/ai-core/src/memory/format-memory-block.ts`                     | 新建              |
| `apps/api/src/domain/` 或 `workers/`                                     | extract processor |
| `conversations.service.ts`                                               | DONE 后 enqueue   |
| `packages/ai-core/src/chains/coach-chat/stream.ts` 或共享 prompt builder | 注入 memory       |

---

## 6. Acceptance criteria

- [x] migration 成功；同 `userId+key` upsert 更新 `value`
- [x] 对话抽取后 Coach 回复能体现记忆（跨会话验证：如肩膀伤病）
- [x] 抽取 job 失败不影响当轮 SSE `done`
- [x] 无向量表、无 embedding 依赖

**验收记录（2026-06-14）**：用户对话抽取 `injury_shoulder`；新会话可读；状态变化触发 `memory_extract`（worker 日志 `upsert N / remove M`）。

---

## 7. 验证步骤

```powershell
pnpm --filter db migrate:dev --name user_agent_memory
# SQL 或 seed 插入 memory
pnpm --filter api start:worker
pnpm --filter api start:api
# Coach 提问验证；观察 worker 日志 extract job
```

---

## 8. 不做

- LangGraph（AGENT-06）
- 用户编辑/删除记忆 UI（可记 backlog）
- 向量检索

---

## 9. 交付物 / 下游

| 交付物                             | 消费者                              |
| ---------------------------------- | ----------------------------------- |
| `AgentMemoryService.listForPrompt` | AGENT-06 system prompt              |
| `AgentMemoryService.applyPatches`  | extract job                         |
| `formatMemoryBlock`                | ai-core Graph                       |
| `buildCoachSystemPrompt`           | 流式 / Agent Runner 共享            |
| extract job（`memory_extract`）    | Worker 日志、`AiRun` MEMORY_EXTRACT |
