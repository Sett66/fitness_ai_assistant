# OBS-01 — Langfuse 基础设施 + 非 Agent COACH_CHAT 端到端 Trace

| 字段           | 值                   |
| -------------- | -------------------- |
| **Type**       | AFK                  |
| **Blocked by** | ADR 0010（Accepted） |
| **Blocks**     | OBS-02               |
| **估时**       | 1 天                 |
| **状态**       | ⬜ 未开工            |

---

## What to build

接入 Langfuse Cloud，使 **`COACH_AGENT_ENABLED=false`** 时的一轮 `COACH_CHAT` 在 Langfuse UI 中可见完整 trace：含 system prompt、历史 messages、流式回复 generation，以及 `inferSuggestedActions` 的 `generateJson` generation。`LANGFUSE_ENABLED=false` 时行为与现网完全一致。

本切片建立观测基建（SDK、env、flag、trace 根、LLM 包装层），并先在**非 Agent 路径**打通端到端，作为后续 Agent ReAct trace 的基础。

---

## 1. 背景 / 可复用基建

- Coach SSE 入口：[`ConversationsService.postMessageStream`](../../../apps/api/src/modules/conversations/conversations.service.ts)
- 非 Agent 链路：[`runCoachChatStream`](../../../packages/ai-core/src/chains/coach-chat/stream.ts) → `streamText` + `inferSuggestedActions`（`generateJson`）
- LLM 客户端：[`OpenAiCompatibleJsonClient`](../../../packages/ai-core/src/llm/openai-compatible.ts)
- Feature flag 先例：[`COACH_AGENT_ENABLED`](../../../apps/api/src/config/env.schema.ts) + [`AgentConfigService`](../../../apps/api/src/config/agent-config.service.ts)
- 每轮聊天已有 `aiRunId`（`AiRun` 记录在 `postMessageStream` 内创建）

---

## 2. 前置阅读

1. [ADR 0010](../../adr/0010-coach-chat-observability-langfuse.md)
2. [ADR 0008](../../adr/0008-coach-agent-tools-and-memory.md) §4.3（`toolTrace` 摘要策略不变）
3. [`docs/issues/observability/README.md`](./README.md)

---

## 3. 详细规格

### 3.1 依赖

在 `apps/api` 增加 Langfuse Node SDK（如 `@langfuse/tracing` 或官方推荐包，以 Langfuse 文档为准）。**不要**在 `apps/mobile` 引入。

### 3.2 环境变量（`apps/api/src/config/env.schema.ts`）

| 变量                   | 默认                         | 说明                          |
| ---------------------- | ---------------------------- | ----------------------------- |
| `LANGFUSE_ENABLED`     | `false`                      | 与 `COACH_AGENT_ENABLED` 独立 |
| `LANGFUSE_PUBLIC_KEY`  | 空                           | 启用时必填                    |
| `LANGFUSE_SECRET_KEY`  | 空                           | 启用时必填                    |
| `LANGFUSE_BASE_URL`    | `https://cloud.langfuse.com` | 可选                          |
| `LANGFUSE_SAMPLE_RATE` | `1`                          | 0–1，可选                     |

Joi：`LANGFUSE_ENABLED=true` 时校验 public/secret key 非空；`test` 环境可放宽。

新增 `ObservabilityConfigService`（或扩展现有 config service）暴露 `isLangfuseEnabled()`、`getSampleRate()`。

### 3.3 Trace 根（`apps/api`）

在 `postMessageStream` 创建 `AiRun` 之后、调用 `runCoachChatStream` / `runCoachAgentStream` 之前：

- 若 `LANGFUSE_ENABLED` 且通过采样：创建 Langfuse trace
  - `id` = `run.id`（`aiRunId`）
  - `sessionId` = `conversationId`
  - `userId` = 当前用户
  - `metadata`：`taskType: COACH_CHAT`、`coachAgent: false|true`、`model`
- trace 通过 **AsyncLocalStorage** 或显式 context 对象传入 ai-core 包装层
- 请求结束（success / error）后 **异步** `flush`；SSE 热路径不得 `await` 全量 flush

### 3.4 LLM 包装层（`packages/ai-core`）

新增可注入的 tracing 钩子，建议形态：

```ts
type LlmTracingHooks = {
  onGenerationStart?: (input: { name: string; model: string; messages: unknown[] }) => string; // returns generationId
  onGenerationEnd?: (input: {
    generationId: string;
    output?: string;
    usage?: LlmUsage;
    error?: string;
  }) => void;
};
```

实现 `createTracingClient(inner: OpenAiCompatibleJsonClient, hooks: LlmTracingHooks)` 或在 client 构造时注入。

**本切片至少包装**：

- `streamText` → generation name `coach-chat-stream`
- `generateJson` → generation name `coach-infer-suggested-actions`（及 `runCoachChatStream` 内触发的调用）

记录：model、messages、output text/JSON、token usage、latency。

### 3.5 接线

- `apps/api` 在 `ConversationsService` 非 Agent 分支传入 tracing hooks（由 Langfuse adapter 实现）
- `COACH_AGENT_ENABLED=true` 时本切片可只创建 trace 根 + 记录 Agent 标记；**Agent 的 `chatWithTools` / tool span 留给 OBS-02**

### 3.6 明确不做

- Agent ReAct `chatWithTools` 包装（OBS-02）
- Tool span（OBS-02）
- Worker AI 任务 trace
- `AiRun.outputJson.langfuseTraceUrl`（OBS-03）
- Langfuse Prompt Management（OBS-04）

---

## Acceptance criteria

- [ ] `LANGFUSE_ENABLED=false` 时，`pnpm typecheck` 通过，非 Agent COACH_CHAT 行为与合并前一致（无额外延迟可感知）
- [ ] `LANGFUSE_ENABLED=true` + 有效 Cloud Key 时，发一轮非 Agent `CHAT`，Langfuse UI 出现 trace（id = `aiRunId`），含 ≥2 个 generation（stream + suggestedActions）
- [ ] trace 含 `sessionId=conversationId`、`userId`、完整 messages（含 system prompt）
- [ ] Langfuse 上报失败不影响 SSE 正常返回 `done`（降级为无 trace，打 warn 日志）
- [ ] env schema 与 `.env.example`（若有）已同步

---

## Blocked by

- [ADR 0010](../../adr/0010-coach-chat-observability-langfuse.md)（Accepted）

---

## 交付物 / 下游

| 交付物                          | 说明                   |
| ------------------------------- | ---------------------- |
| Langfuse SDK + config + flag    | `apps/api`             |
| Trace 根 + async flush          | `ConversationsService` |
| LLM tracing hooks + 包装 client | `packages/ai-core`     |
| 非 Agent E2E trace              | 手测 Langfuse UI       |

**下游**：[OBS-02](./OBS-02.md) 在此基础上扩展 Agent `chatWithTools` 与 tool span。
