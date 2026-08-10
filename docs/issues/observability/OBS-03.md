# OBS-03 — 观测验收脚本、AiRun 指针与 HANDOFF 文档

| 字段           | 值                    |
| -------------- | --------------------- |
| **Type**       | AFK                   |
| **Blocked by** | [OBS-02](./OBS-02.md) |
| **Blocks**     | OBS-04                |
| **估时**       | 0.5–1 天              |
| **状态**       | ⬜ 未开工             |

---

## What to build

为 Langfuse 观测 Epic 提供**可重复验收**与**接手文档**：扩展或新增 PowerShell 验收脚本（覆盖非 Agent + Agent 路径的 trace 可验证性）、在 `AiRun.outputJson` 写入 Langfuse trace 指针、更新 HANDOFF 说明 env 与手测步骤。使维护者无需读全量 PR 即可验证 Phase 1 回归。

---

## 1. 背景

- 先例：[`scripts/m5-agent-acceptance.ps1`](../../../scripts/m5-agent-acceptance.ps1)、[`docs/HANDOFF-M5.md`](../../HANDOFF-M5.md)
- OBS-01/02 完成后，需自动化或半自动化确认「trace 已创建且结构合理」
- 从 DB 查 `AiRun` 时应能跳到 Langfuse UI 调试

---

## 2. 前置阅读

1. [OBS-01](./OBS-01.md)、[OBS-02](./OBS-02.md)、[ADR 0010](../../adr/0010-coach-chat-observability-langfuse.md)
2. [`docs/issues/agent/AGENT-10.md`](../agent/AGENT-10.md)（验收脚本格式参考）
3. [`packages/shared/src/schemas/ai-task.ts`](../../../packages/shared/src/schemas/ai-task.ts)（`outputJson` 形状）

---

## 3. 详细规格

### 3.1 `AiRun.outputJson` 指针（可选字段）

在 `persistCoachChatSuccess` 写入（仅 `LANGFUSE_ENABLED=true` 且 trace 创建成功时）：

```ts
observability?: {
  traceId: string;        // = aiRunId
  traceUrl?: string;      // Langfuse UI 深链（若 SDK 提供或可拼接）
  generationCount?: number;
  toolSpanCount?: number;
}
```

- Zod：在 shared 或 api 层用宽松 `z.object().optional()` 扩展，**不破坏**现有 `outputJson` 解析
- `GET /v1/ai/tasks/:id` 应能返回该字段供脚本断言

### 3.2 验收脚本 `scripts/observability-acceptance.ps1`

**参数**（建议）：

| 参数                 | 默认                       | 说明                           |
| -------------------- | -------------------------- | ------------------------------ |
| `BaseUrl`            | `http://127.0.0.1:3000/v1` |                                |
| `Phone` / `Password` | demo 账号                  |                                |
| `-SkipCoachChat`     |                            | 无 DeepSeek 时跳过             |
| `-RequireLangfuse`   |                            | 未设 `LANGFUSE_ENABLED` 则失败 |
| `-SkipAgentPath`     |                            | 只测非 Agent                   |

**步骤**：

1. Auth
2. 确认 env 提示（脚本可打印说明，或调 health/debug 端点若存在）
3. **非 Agent**（需 `COACH_AGENT_ENABLED=false` 或文档说明单独跑）：发 `CHAT` → 轮询/解析 SSE → 断言 `outputJson.observability.traceId` 存在（`-RequireLangfuse` 时）
4. **Agent**（`COACH_AGENT_ENABLED=true`）：发带 `locationContext` 的消息 → 断言 `toolTrace` 含 `get_weather`（或放宽）且 `observability.toolSpanCount >= 1`（若写入）
5. 文档说明：Langfuse UI 人工确认 trace 的步骤（脚本无法替代 UI 时）

参考 `m5-agent-acceptance.ps1` 的 SSE 解析方式；若过重，可文档化手测 + 脚本只断言 API 字段。

### 3.3 `docs/HANDOFF-OBSERVABILITY.md`（新建）

建议章节：

1. **阶段目标**：Phase 1 Langfuse trace 闭环
2. **环境变量表**（ADR 0010 §5）
3. **启动顺序**：api + `LANGFUSE_ENABLED=true` + Langfuse Cloud 项目
4. **手测清单**：非 Agent 一轮、Agent 天气一轮、flag 关闭回归
5. **故障排查**：上报失败、trace 为空、跨境延迟
6. **Phase 2 指针**：见 OBS-04

### 3.4 更新索引

- [`docs/issues/observability/README.md`](./README.md) 状态列在 Epic 关闭时更新
- 可选：根 [`README.md`](../../../README.md) Roadmap 加一行「Coach 观测 Phase 1」

### 3.5 明确不做

- Langfuse Prompt Management（OBS-04）
- CI 强制连 Langfuse Cloud（可文档化 optional job）

---

## Acceptance criteria

- [ ] `observability-acceptance.ps1` 在本地可跑（`-SkipCoachChat` / 无 Key 时优雅跳过）
- [ ] `-RequireLangfuse` 模式下，成功跑通后 `AiRun.outputJson.observability.traceId` 非空
- [ ] `HANDOFF-OBSERVABILITY.md` 含 env 表与手测步骤
- [ ] `LANGFUSE_ENABLED=false` 时脚本仍可通过（不断言 observability 字段）
- [ ] `pnpm lint && pnpm typecheck` 通过

---

## Blocked by

- [OBS-02](./OBS-02.md)

---

## 交付物 / 下游

| 交付物                                 | 说明    |
| -------------------------------------- | ------- |
| `scripts/observability-acceptance.ps1` | 验收    |
| `docs/HANDOFF-OBSERVABILITY.md`        | 接手    |
| `AiRun.outputJson.observability`       | DB 指针 |

**下游**：[OBS-04](./OBS-04.md) Phase 2 Prompt Management（需 trace 基线后再做）。
