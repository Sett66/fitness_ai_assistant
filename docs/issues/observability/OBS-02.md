# OBS-02 — Agent 路径 ReAct + Tool Span 全链路 Trace

| 字段           | 值                    |
| -------------- | --------------------- |
| **Type**       | AFK                   |
| **Blocked by** | [OBS-01](./OBS-01.md) |
| **Blocks**     | OBS-03                |
| **估时**       | 1 天                  |
| **状态**       | ⬜ 未开工             |

---

## What to build

在 OBS-01 基建上，使 **`COACH_AGENT_ENABLED=true`** 的一轮 Agent `COACH_CHAT` 在 Langfuse UI 呈现完整 ReAct 时间线：每次 `chatWithTools` generation、每个工具执行的 span（含完整 input/observation）、最终 `streamText` generation、以及 `inferSuggestedActions` generation。同一 trace 内可还原「用户问天气 → 调 `get_weather` → 流式回答」全过程。

---

## 1. 背景

- Agent 编排：[`runCoachAgentStream`](../../../packages/ai-core/src/graphs/coach-agent/run-stream.ts) → `runCoachAgentToolLoopStream` + `streamText` + `inferSuggestedActions`
- ReAct 图：[`createCoachAgentGraph`](../../../packages/ai-core/src/graphs/coach-agent/graph.ts)（`agent` / `tools` 节点）
- 工具执行：[`CoachAgentRunner`](../../../apps/api/src/domain/agent/coach-agent.runner.ts) → [`ToolRegistryService.execute`](../../../apps/api/src/domain/agent/tool-registry.service.ts)
- SSE 已有 `tool_start` / `tool_end`；DB `toolTrace` 仍为摘要（ADR 0008），Langfuse 存详情

---

## 2. 前置阅读

1. [OBS-01](./OBS-01.md)、[ADR 0010](../../adr/0010-coach-chat-observability-langfuse.md)
2. [ADR 0008](../../adr/0008-coach-agent-tools-and-memory.md) §2 工具表、§4.2 SSE 事件
3. [`packages/ai-core/src/graphs/coach-agent/tools-schema.ts`](../../../packages/ai-core/src/graphs/coach-agent/tools-schema.ts)

---

## 3. 详细规格

### 3.1 扩展 LLM 包装：`chatWithTools`

在 OBS-01 的 tracing client 上增加 `chatWithTools` 包装：

- generation name：`coach-agent-react`（或 `coach-agent-react-{iteration}` 若可拿到 iteration）
- 记录：messages、tools schema 引用、assistant message（含 `tool_calls`）、usage、latency
- 每次 ReAct 循环一次 generation（与 graph `agentNode` 调用一一对应）

### 3.2 Tool span

在工具执行边界上报 span，推荐在 **`ToolRegistryService.execute`**（覆盖所有工具、含日限错误路径）：

| 字段       | 内容                                |
| ---------- | ----------------------------------- |
| `name`     | `tool:{CoachToolName}`              |
| `input`    | 工具入参 JSON                       |
| `output`   | observation 全文（或结构化 result） |
| `metadata` | `ok`、`durationMs`                  |

与 graph 内 `toolsNode` 二选一为主埋点，**避免重复 span**；优先 Registry（单一真相、enqueue 工具也覆盖）。

### 3.3 Agent 路径接线

- `CoachAgentRunner.run` / `runCoachAgentStreamPath` 使用 OBS-01 同一 trace context（`aiRunId`）
- trace metadata 标记 `coachAgent: true`
- 最终 `streamText` generation name：`coach-agent-final-stream`
- `inferSuggestedActions` 与非 Agent 共用 generation name 即可

### 3.4 与现有审计的关系

- `CoachToolTraceItem` 落库逻辑 **不改**（仍摘要）
- Langfuse span 可含完整坐标；生产可通过 `LANGFUSE_SAMPLE_RATE` 或后续脱敏开关控制（本切片 dev 全量即可）

### 3.5 明确不做

- 修改 ReAct 上限或工具业务逻辑
- Worker 内 `memory_extract` trace
- Prompt Management（OBS-04）

---

## Acceptance criteria

- [ ] `COACH_AGENT_ENABLED=true` + `LANGFUSE_ENABLED=true` 时，发送带 `locationContext` 的天气相关问题，Langfuse trace 含 `chatWithTools` generation（≥1）、`tool:get_weather` span、最终 stream generation
- [ ] 工具失败路径（如日限、缺 Key）在 Langfuse 中可见 span 且 `ok=false`，SSE 仍正常返回
- [ ] 同一 `aiRunId` 对应单一 trace，generation/span 无重复翻倍
- [ ] `LANGFUSE_ENABLED=false` 时 Agent 行为与 OBS-02 合并前一致
- [ ] 多轮 ReAct（如先 `geocode_place` 再 `search_nearby_gyms`）在 UI 时间线顺序正确

---

## Blocked by

- [OBS-01](./OBS-01.md)

---

## 交付物 / 下游

| 交付物                  | 说明                             |
| ----------------------- | -------------------------------- |
| `chatWithTools` tracing | `packages/ai-core`               |
| Tool span               | `ToolRegistryService` 或等价单点 |
| Agent E2E trace         | 手测 Langfuse UI                 |

**下游**：[OBS-03](./OBS-03.md) 验收脚本与 `AiRun` 指针。
