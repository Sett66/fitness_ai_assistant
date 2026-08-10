# OBS-04 — Phase 2：Langfuse Prompt Management（工具描述版本化）

| 字段           | 值                                        |
| -------------- | ----------------------------------------- |
| **Type**       | AFK                                       |
| **Blocked by** | [OBS-03](./OBS-03.md)                     |
| **Blocks**     | 无                                        |
| **估时**       | 1–2 天                                    |
| **状态**       | ⬜ 未开工（Phase 2，有 trace 基线后再做） |

---

## What to build

在 Phase 1 trace 稳定运行并积累错工具/幻觉案例后，将 **Coach Agent 工具描述**（`COACH_AGENT_TOOL_DEFINITIONS` 的 `description` 字段）迁入 **Langfuse Prompt Management**，支持按版本拉取、在 trace 上标记 `promptVersion`，便于对比「改 tool description 前后」的 ReAct 行为。`CoachToolName` 枚举与 Zod 契约仍保留在 `packages/shared`。

本切片**不迁移**完整 system prompt（`buildCoachSystemPrompt`）除非 Phase 2 前半段验证工具描述 alone 不够；迁移顺序遵循 ADR 0010 §6。

---

## 1. 背景 / 触发条件

**建议满足后再开工**（写在 PR 描述中）：

- OBS-03 已关闭，Phase 1 手测/脚本通过
- Langfuse 中已有 ≥5 个可复现问题 case（错选工具、ReAct 超限、幻觉），均有 `aiRunId`
- 或 Phase 1 稳定运行 ≥1 周

**目标**：降低 AI 错选工具概率（用户诉求 B），而非替代 trace 调试（诉求 A）。

---

## 2. 前置阅读

1. [ADR 0010](../../adr/0010-coach-chat-observability-langfuse.md) §6 Phase 2
2. [OBS-03](./OBS-03.md)
3. [`packages/ai-core/src/graphs/coach-agent/tools-schema.ts`](../../../packages/ai-core/src/graphs/coach-agent/tools-schema.ts)
4. [Langfuse Prompt Management 文档](https://langfuse.com/docs/prompts/get-started)

---

## 3. 详细规格

### 3.1 Langfuse Prompt 命名约定

建议：

| Prompt name                    | 内容                                                        |
| ------------------------------ | ----------------------------------------------------------- |
| `coach-agent-tool-definitions` | 序列化后的 tools JSON（或按工具拆分为 `coach-tool-{name}`） |

在 Langfuse UI 创建初版，内容与当前 `tools-schema.ts` **等价**。

### 3.2 运行时拉取

- `LANGFUSE_PROMPT_ENABLED`（默认 `false`）独立于 `LANGFUSE_ENABLED`
- 启用时：graph 构建 tools 列表前从 Langfuse 拉取 prompt（带缓存 TTL，如 60s，避免每请求打 API）
- 拉取失败 **fallback** 到代码内嵌 definitions（与 flag 关闭行为一致）
- generation/trace metadata 写入 `promptName` + `promptVersion`

### 3.3 契约边界

- `CoachToolNameSchema`、`EnqueuePlanGenerateInputSchema` 等 **仍在 shared**
- 仅 **description / 自然语言说明** 外置；`parameters` JSON Schema 可暂留代码（减少运行时校验风险）

### 3.4 文档

在 `HANDOFF-OBSERVABILITY.md` 增加：

- 如何在 Langfuse 新建 prompt 版本
- 如何用 trace 对比 v1 vs v2
- 回滚：设 `LANGFUSE_PROMPT_ENABLED=false`

### 3.5 明确不做

- 向量化 RAG / 自动 prompt 优化
- 移动端拉取 prompt
- 迁移 `buildCoachSystemPrompt` 全文（除非本 Issue 验收后单开子任务）

---

## Acceptance criteria

- [ ] `LANGFUSE_PROMPT_ENABLED=true` 时，Agent 使用的 tool descriptions 来自 Langfuse 指定版本
- [ ] Langfuse 修改 tool description 并发布新版本后，重启或缓存过期后 Agent 行为可使用新版本（无需改代码）
- [ ] trace metadata 可见 `promptVersion`
- [ ] Langfuse 不可用或 flag 关闭时，fallback 到 `tools-schema.ts`，Agent 正常回复
- [ ] `pnpm typecheck` 通过；至少 1 个单测或集成测覆盖 fallback

---

## Blocked by

- [OBS-03](./OBS-03.md)
- **建议**：Phase 1 trace 基线 + 问题 case 积累（见 §1）

---

## 交付物 / 下游

| 交付物                         | 说明                             |
| ------------------------------ | -------------------------------- |
| Prompt 拉取 + cache + fallback | `packages/ai-core` 或 `apps/api` |
| `LANGFUSE_PROMPT_ENABLED`      | env schema                       |
| HANDOFF 更新                   | Prompt 运维说明                  |

**下游**：若需迁移 system prompt，单开 OBS-05 或扩写本 Issue。
