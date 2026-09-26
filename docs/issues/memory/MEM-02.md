# MEM-02 — 记忆数据模型：类别、软删除、审计与抑制名单

| 字段           | 值                    |
| -------------- | --------------------- |
| **Type**       | AFK                   |
| **Wave**       | W1                    |
| **Blocked by** | [MEM-01](./MEM-01.md) |
| **Blocks**     | MEM-03、MEM-04        |
| **估时**       | 2 天                  |
| **状态**       | ✅ 已实施             |

---

## 1. 目标

把 `UserAgentMemory` 从「`(userId, key)` 复合主键 + 硬删」改成 ADR 0012 §1 的模型：独立 `id`、`category:slug`、软删除、append-only 审计、抑制名单查询。

本切片不添加工具、不接 Meili、不拆抽取 job。旧的 `memory_extract` 在 MEM-03 拆除前仍会写库，所以 `applyPatches` 必须能写入新结构，迁移上线后抽取不能失败。

---

## 2. 背景

现状（[`schema.prisma`](../../../packages/db/prisma/schema.prisma) 的 `UserAgentMemory`）：

- `@@id([userId, key])`，`key` `VarChar(64)`，`value` `VarChar(512)`
- `applyPatches` 对 `remove` 走 `deleteMany`，upsert 覆盖 `sourceMessageId`
- 没有 category、没有软删除、没有审计

最长类别 `diet_restriction`（16）+ `:` + slug（48）= 65，现有 `VarChar(64)` 放不下，本切片放宽 `key`。

---

## 3. 前置阅读

1. [ADR 0012](../../adr/0012-coach-memory-tooling-and-hybrid-recall.md) §1
2. [`apps/api/src/domain/agent-memory.service.ts`](../../../apps/api/src/domain/agent-memory.service.ts)
3. [`packages/shared/src/schemas/agent.ts`](../../../packages/shared/src/schemas/agent.ts) 的 `AgentMemoryFactSchema` / `AgentMemoryPatchSchema`
4. [MEM-01](./MEM-01.md) 的 `key` 形式，回填规则要能产生同样的 key

---

## 4. 详细规格

### 4.1 Prisma

```prisma
enum MemoryCategory {
  injury
  diet_restriction
  diet_pref
  equipment
  schedule
  location
  goal_note
  other
}

enum MemoryEventAction {
  CREATE
  UPDATE
  DELETE
  RESTORE
}

enum MemoryEventActor {
  AGENT
  USER
  SYSTEM
}

model UserAgentMemory {
  id              String         @id @default(cuid())
  userId          String
  key             String         @db.VarChar(80)
  category        MemoryCategory
  value           String         @db.VarChar(512)
  confidence      Float          @default(0.8)
  sourceMessageId String?
  deletedAt       DateTime?
  lastUsedAt      DateTime?
  hitCount        Int            @default(0)
  embeddedAt      DateTime?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  user   User                   @relation(fields: [userId], references: [id], onDelete: Cascade)
  events UserAgentMemoryEvent[]

  @@unique([userId, key])
  @@index([userId, updatedAt])
  @@index([userId, category, deletedAt])
}

model UserAgentMemoryEvent {
  id              String            @id @default(cuid())
  memoryId        String
  action          MemoryEventAction
  valueSnapshot   String            @db.VarChar(512)
  actor           MemoryEventActor
  sourceRunId     String?
  sourceMessageId String?
  createdAt       DateTime          @default(now())

  memory UserAgentMemory @relation(fields: [memoryId], references: [id], onDelete: Cascade)

  @@index([memoryId, createdAt])
}
```

`User` 上补 `agentMemoryEvents` 不需要——事件通过 memory 级联。`agentMemories` 关系保留。

迁移必须**保留已有行**：先加 `id` 与新列，回填，再删掉旧的复合主键。不要 `DROP TABLE` 重建。

### 4.2 存量回填

对每一行现有记忆（迁移 SQL 或一次性脚本，`actor = SYSTEM`，`action = CREATE`）：

1. `key` 已匹配 `^(injury|diet_restriction|diet_pref|equipment|schedule|location|goal_note|other):[a-z0-9_]{1,48}$` → 拆出 category，原样保留
2. 否则按前缀归类：`injury_` / `diet_no_` / `diet_` / `equipment_` / `travel_` / `schedule_` / `goal_`，slug 取前缀之后的部分并规范化
3. 归不进的 → `category = other`，`key = other:` + 原 key 规范化后的 slug
4. slug 规则：小写、非 `[a-z0-9_]` 换成 `_`、压缩连续下划线、截断到 48、去首尾下划线；结果为空则用 `legacy`
5. 同一用户回填后 key 冲突：保留 `updatedAt` 较新的一行，另一行 `category = other` 且 slug 加 `_2` 后缀，两条都留审计

`embeddedAt` 全部为 `null`，留给 MEM-04 的 backfill。

### 4.3 shared 契约

在 `packages/shared` 增加：

- `MemoryCategorySchema`：与 Prisma 枚举一致
- `MemoryKeySchema`：`category:slug`，总长 ≤80
- `normalizeMemorySlug(raw: string): string`：与 §4.2 同一套规则，服务端与后续工具共用，禁止两处各写一份

`AgentMemoryFactSchema` 增加 `category`。`AgentMemoryPatchSchema` 保留到 MEM-03 拆除抽取为止；本切片让 patch 的 `key` 在写入前走规范化：无法归类则拒绝该条 patch 并记日志，不让整次抽取失败。

### 4.4 `AgentMemoryService` 行为变更

| 方法                                | 行为                                                                                                                                                                                                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listForPrompt(userId, limit = 20)` | `deletedAt: null`，仍按 `updatedAt desc`。供旧抽取与 MEM-03 之前的 prompt 使用                                                                                                                                                                           |
| `applyPatches`                      | upsert 改为按 `(userId, key)`：行不存在则 CREATE；存在且 `deletedAt != null` 时，若命中抑制名单则跳过，否则 RESTORE 并清空 `deletedAt`；存在且未删除则 UPDATE。`remove` 改为 `deletedAt = now()` + `DELETE` 事件，`actor = AGENT`，**禁止** `deleteMany` |
| `isSuppressed(userId, key)`         | 该 key 的记忆行 `deletedAt != null`，且最新一条事件为 `actor = USER` 且 `action = DELETE`。本切片没有用户 API，用单测直接插事件来验证                                                                                                                    |
| `recordEvent`                       | 每次状态变化追加一条，`valueSnapshot` 为变更后的 value（DELETE 记删除前的 value）                                                                                                                                                                        |

同 key 再次写入时复活原行，不插入第二行，因此 `@@unique([userId, key])` 不冲突。

### 4.5 单测

`apps/api` 下为 `applyPatches` / `isSuppressed` / `normalizeMemorySlug` 补测试（现有记忆链路没有测试）：

- confidence < 0.6 的 patch 不落库
- remove 后行仍在，`deletedAt` 非空，再 list 不可见
- 非抑制的软删除行被同 key upsert 复活，事件为 `RESTORE`
- USER + DELETE 之后，AGENT 的 upsert 被跳过
- slug 规范化：空格、大写、超长截断

---

## 5. 建议改动文件

| 路径                                               | 动作                     |
| -------------------------------------------------- | ------------------------ |
| `packages/db/prisma/schema.prisma`                 | 模型与枚举               |
| `packages/db/prisma/migrations/*`                  | 迁移 + 回填              |
| `packages/shared/src/schemas/agent.ts`             | category、key、slug      |
| `apps/api/src/domain/agent-memory.service.ts`      | 软删除、复活、抑制、审计 |
| `apps/api/src/domain/agent-memory.service.spec.ts` | 新建                     |

---

## 6. Acceptance criteria

- [ ] 迁移可在已有 `UserAgentMemory` 数据上执行，旧行不丢，且各自有一条 `SYSTEM/CREATE` 事件
- [ ] `key` 列宽为 80；`diet_restriction:` + 48 字符 slug 能写入
- [ ] `remove` 不再物理删除；`listForPrompt` 看不到 `deletedAt != null` 的行
- [ ] 抑制名单上的 key，AGENT upsert 不复活
- [ ] 非抑制的软删除行可被同 key 复活，且不产生第二行
- [ ] `pnpm --filter api test` 中新增用例通过；旧 `memory_extract` 路径仍能调用 `applyPatches`

---

## 7. 验证步骤

```powershell
pnpm --filter db migrate:dev --name user_agent_memory_v2
pnpm --filter api test -- agent-memory
```

抽查回填：随机 5 行旧记忆，`category` 非空，`key` 含 `:`，审计表有对应 `memoryId`。

---

## 8. 不做

- `save_memory` / `forget_memory` / `recall_memory`（MEM-03、MEM-05）
- 拆除 `extractMemoryFacts` 与 `MEMORY_EXTRACT`（MEM-03）
- embedding、Meili、`embeddedAt` 回填（MEM-04）
- 用户可见的记忆 API（MEM-06）
- 按类别或相关性改变 `listForPrompt` 的排序（仍是时间序，MEM-05 才换读取方式）

---

## 9. 交付物 / 下游

| 交付物                                      | 消费者                           |
| ------------------------------------------- | -------------------------------- |
| `MemoryCategory`、`normalizeMemorySlug`     | MEM-03 工具校验、MEM-04 索引文档 |
| `isSuppressed`、软删除、复活、`recordEvent` | MEM-03 写入、MEM-06 用户删除     |
| `embeddedAt` 列（全 null）                  | MEM-04 backfill                  |
| 仍可用的 `applyPatches`                     | 拆除前的 `memory_extract`        |
