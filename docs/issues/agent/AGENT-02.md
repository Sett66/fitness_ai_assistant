# AGENT-02 — 共享契约与 Agent Feature Flag

| 字段           | 值                                             |
| -------------- | ---------------------------------------------- |
| **Type**       | AFK                                            |
| **Wave**       | W1                                             |
| **Blocked by** | [AGENT-01](./AGENT-01.md)（ADR 0008 Accepted） |
| **Blocks**     | AGENT-04, 06, 09                               |
| **估时**       | 1 天                                           |

---

## 1. 目标

在 `packages/shared` 落地 Agent Epic 的**端到端 Zod 契约**，并在 `apps/api` 读取 **`COACH_AGENT_ENABLED`**（默认 `false`）。

**本 Issue 不改变运行时行为**：flag 为 false 时，Coach SSE 仍走 `runCoachChatStream`，移动端无回归。

完成后，其他 Agent 可依赖稳定类型开发 Geo、定位、Graph，而无需各自发明 JSON shape。

---

## 2. 背景

- 契约单一真相源：[`packages/shared`](../../../packages/shared)；API 用 `parseWith`，移动端用 `.parse()`
- 现有 Coach 消息：[`CreateCoachMessageSchema`](../../../packages/shared/src/schemas/conversation.ts)
- 现有 SSE 事件：`CoachStreamAcceptedEventSchema`、`Delta`、`Done`、`Error`（同文件）
- ADR 0008 定义的工具名、SSE `tool_start/end` 须在本 Issue 固化为 Zod

---

## 3. 前置阅读

1. [AGENT-01](./AGENT-01.md) 产出之 ADR 0008（**以 ADR 为准**，若与本文冲突修本文）
2. [`packages/shared/src/schemas/conversation.ts`](../../../packages/shared/src/schemas/conversation.ts)
3. [`apps/api/src/modules/conversations/conversations.controller.ts`](../../../apps/api/src/modules/conversations/conversations.controller.ts)（SSE 写事件处）

---

## 4. 详细规格

### 4.1 新增文件建议

`packages/shared/src/schemas/agent.ts`（或拆 `location.ts` + `agent.ts`）：

#### `LocationContextSchema`

```ts
{
  lat: number;      // -90..90
  lng: number;      // -180..180
  accuracyM?: number;
  city?: string;    // max 64
  capturedAt: string; // ISO datetime
}
```

#### `CoachToolNameSchema`

`z.enum([...])`，与 ADR 0008 工具表**逐字一致**，至少包含：

- `get_user_fitness_snapshot`
- `get_weather`
- `geocode_place`
- `search_nearby_gyms`
- `enqueue_plan_generate`
- `enqueue_meal_vision`

#### `CoachToolTraceItemSchema`

```ts
{
  name: CoachToolName;
  inputSummary?: string;   // 脱敏后摘要，max 256
  outputSummary?: string;  // max 512
  durationMs: number;
  ok: boolean;
}
```

#### `AgentMemoryFactSchema`（供 AGENT-05 使用，本 Issue 先定义）

```ts
{
  key: string;    // max 64，如 "preferred_cardio"
  value: string;  // max 512
  confidence?: number; // 0..1
}
```

#### SSE 事件（扩展 conversation.ts 或 agent.ts）

- `CoachStreamToolStartEventSchema`: `{ name: CoachToolName, label?: string }`
- `CoachStreamToolEndEventSchema`: `{ name, ok: boolean, summary?: string }`

在 `CoachStreamDoneEventSchema` 的 `usage` 旁**可选**增加 `toolTrace?: CoachToolTraceItem[]`（与 metadata 对齐）。

### 4.2 修改 `CreateCoachMessageSchema`

增加可选字段：

```ts
locationContext: LocationContextSchema.optional();
```

`superRefine` 不变：CHAT 仍要求 `content` 非空。

### 4.3 导出

- `packages/shared/src/schemas/index.ts` 或 `packages/shared/src/index.ts` 导出所有新类型
- 运行 `pnpm --filter shared build`

### 4.4 API Feature Flag

| 项       | 规格                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| 环境变量 | `COACH_AGENT_ENABLED`，字符串 `true`/`false`，默认 **false**                                                       |
| 校验     | 加入 [`apps/api/src/config/env.schema.ts`](../../../apps/api/src/config/env.schema.ts) Joi + `EnvShape` + `mapEnv` |
| 注入     | `ConfigService` 或小型 `AgentConfigService` 暴露 `isCoachAgentEnabled(): boolean`                                  |
| 使用点   | **本 Issue 仅读取**，在 `ConversationsService` 或 config 打日志/占位；**不要**在 02 切换 Graph（属 AGENT-06）      |
| 文档     | 根 [`.env.example`](../../../.env.example)、[`apps/api/.env.example`](../../../apps/api/.env.example) 增加注释行   |

### 4.5 测试

在 `packages/shared` 或 `apps/api/test` 增加冒烟：

- 合法/非法 `LocationContext` parse
- `CoachToolName` 拒绝未知工具名
- `CreateCoachMessageSchema` 带 `locationContext` 通过

---

## 5. 建议改动文件

| 路径                                          | 动作                |
| --------------------------------------------- | ------------------- |
| `packages/shared/src/schemas/agent.ts`        | 新建                |
| `packages/shared/src/schemas/conversation.ts` | 扩展 CHAT + Done    |
| `packages/shared/src/schemas/index.ts`        | export              |
| `apps/api/src/config/env.schema.ts`           | COACH_AGENT_ENABLED |
| `.env.example` / `apps/api/.env.example`      | 注释                |
| `apps/api/src/config/` 或新 `agent-config`    | 读取 flag           |

**不要改**：`runCoachChatStream`、`postMessageStream` 主逻辑（AGENT-06）。

---

## 6. Acceptance criteria

- [x] `pnpm typecheck` 全仓通过（`@fitness/api`、`@fitness/shared` 已通过；`ui`/`mobile` 既有错误与本次无关）
- [x] `COACH_AGENT_ENABLED` 未设置或为 false 时，Coach 手测与合并前一致（未切换 `runCoachChatStream`）
- [x] 新 Zod schema 有至少 1 个 parse 测试（`apps/api/test/agent-schemas.spec.ts`）
- [x] 移动端可 import 新类型（`@fitness/shared` 已导出 `LocationContext`、`CoachToolName` 等）

---

## 7. 验证步骤

```powershell
pnpm --filter shared build
pnpm typecheck
pnpm test
# 可选：pnpm --filter api start:api 后 .\scripts\m4-acceptance.ps1
```

---

## 8. 不做

- LangGraph 依赖与 Graph 实现（AGENT-06）
- 移动端定位模块（AGENT-04）
- Geo HTTP 客户端（AGENT-03）

---

## 9. 交付物 / 下游

| 交付物                    | 消费者                                 |
| ------------------------- | -------------------------------------- |
| `LocationContextSchema`   | AGENT-04 mobile、AGENT-06 Runner input |
| `CoachToolName` + trace   | AGENT-06 ToolRegistry、07、08          |
| `CoachStreamTool*` events | AGENT-06 SSE、AGENT-07 UI              |
| `COACH_AGENT_ENABLED`     | AGENT-06 切换路径                      |
