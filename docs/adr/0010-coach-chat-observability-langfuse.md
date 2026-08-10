# 0010 — Coach 聊天观测：Langfuse Cloud 与 OpenAiCompatible 包装层

## Context

M5 已交付 Coach 真 Agent（ADR [0008](./0008-coach-agent-tools-and-memory.md)）：`COACH_CHAT` 经 SSE 同步执行，非 Agent 路径走 `runCoachChatStream`，Agent 路径走 `runCoachAgentStream`（LangGraph ReAct + 最终流式 + `inferSuggestedActions`）。

产品侧需要**观测与调试 Agent 回复质量**（错选工具、幻觉、ReAct 多轮行为）。现有基建：

| 能力   | 现状                                                                            | 缺口                                  |
| ------ | ------------------------------------------------------------------------------- | ------------------------------------- |
| 任务级 | `AiRun`（status、tokens、duration、`inputJson`/`outputJson`）                   | `inputJson` 仅用户文本，无完整 prompt |
| 工具级 | `toolTrace` 摘要写入 `outputJson` / `Message.metadata`（ADR 0008 隐私）         | 无完整 observation；无时间线 UI       |
| LLM 级 | 多段调用（`chatWithTools` × N + `streamText` + `generateJson`）合并为一条 usage | 无法分段定位 token/延迟               |

PRD §6 要求 AI 任务可观测；ARCHITECTURE §9 规划在 **AI 调用 > 1k/天** 时引入 **LangSmith**。经 grill 决策（2026-08-10）：

- **首要目标**：调试 `COACH_CHAT` 回复质量（刚需）
- **次要**：Prompt / 工具描述版本化（略优先于纯成本统计，第二阶段再做）
- **约束**：费用可控（无意外账单）、上报不拖慢 SSE；隐私不敏感
- **范围**：仅 `COACH_CHAT`（Agent + 非 Agent 流式），不含 Worker 侧重任务（plan / vision / memory_extract）
- **集成**：保持 ADR [0005](./0005-m3-ai-context-and-execution.md) 的 **`OpenAiCompatibleJsonClient`**，加 tracing 包装层；**不迁** LangChain `ChatModel`
- **平台**：**Langfuse Cloud Hobby** 起步；LangSmith **当前阶段不引入**

## Decision

### 1. 观测平台：Langfuse Cloud（Hobby）

- 注册 [Langfuse Cloud](https://cloud.langfuse.com)，使用 Hobby 计划（约 5 万 billable units/月，硬上限、无信用卡）
- 本阶段 **不自托管**；若额度或跨境延迟不满足，再评估 Langfuse OSS Docker（见 Consequences）
- **不引入 LangSmith**：在包装层埋点方案下无原生集成优势；免费档更紧；超额 pay-as-you-go；与 ARCH §9 远期项不冲突

### 2. 集成形态：包装 `OpenAiCompatibleJsonClient`

在 `packages/ai-core` 增加可选 tracing 装饰器（或回调），由 `apps/api` 注入 Langfuse client。覆盖 `COACH_CHAT` 使用的三个方法：

| 方法            | 用途                             |
| --------------- | -------------------------------- |
| `chatWithTools` | Agent ReAct 循环                 |
| `streamText`    | 最终流式回复（Agent + 非 Agent） |
| `generateJson`  | `inferSuggestedActions` 等       |

**硬性约束**：

- 所有 Langfuse 写入 **异步**，禁止在 SSE 热路径 `await` 全量 flush
- `LANGFUSE_ENABLED=false`（默认）时行为与现网 **完全一致**
- DB 侧 `toolTrace` 摘要策略（ADR 0008）**不变**；完整 observation 仅 Langfuse 可见

### 3. Trace 关联 ID

| Langfuse 字段 | 来源                                           |
| ------------- | ---------------------------------------------- |
| `trace.id`    | `aiRunId`                                      |
| `sessionId`   | `conversationId`                               |
| `userId`      | metadata                                       |
| `tags`        | `taskType:COACH_CHAT`、`coachAgent:true/false` |

可选：在 `AiRun.outputJson` 写入 `langfuseTraceUrl` 或 `observability.traceId` 指针，便于从 DB 跳转 UI。

### 4. Tool span

Agent 路径在工具执行处上报 **span**（`ToolRegistry.execute` 或 graph `toolsNode`）：

- `name` = `CoachToolName`
- `input` / `output` = 完整 JSON（dev 环境；生产可采样）
- 与 SSE `tool_start` / `tool_end` 并存，不替代 `toolTrace` 落库

### 5. 环境变量

| 变量                   | 必需   | 说明                              |
| ---------------------- | ------ | --------------------------------- |
| `LANGFUSE_ENABLED`     | 否     | 默认 `false`                      |
| `LANGFUSE_PUBLIC_KEY`  | 启用时 | Cloud 项目公钥                    |
| `LANGFUSE_SECRET_KEY`  | 启用时 | Cloud 项目私钥                    |
| `LANGFUSE_BASE_URL`    | 否     | 默认 `https://cloud.langfuse.com` |
| `LANGFUSE_SAMPLE_RATE` | 否     | 可选采样，默认 `1`                |

配置校验放在 `apps/api` config schema（与 `COACH_AGENT_ENABLED` 同级）。

### 6. 阶段划分

#### Phase 1（本 ADR 范围）

1. Langfuse SDK + flag + trace 根（`postMessageStream`）
2. 非 Agent 路径：`streamText` + `generateJson` generation
3. Agent 路径：`chatWithTools` + tool span + 流式 + suggestedActions
4. 验收脚本或扩展 `m5-agent-acceptance.ps1`；`docs/issues/observability/` 实施文档

#### Phase 2（单独 Issue，不在 Phase 1 阻塞）

- 启用 [Langfuse Prompt Management](https://langfuse.com/docs/prompts/get-started)
- **触发条件**：Phase 1 稳定 ≥1 周，或积累 ≥5 个可复现错工具/幻觉 case（均有 `aiRunId`）
- **迁移顺序**：`COACH_AGENT_TOOL_DEFINITIONS` 的 description → `buildCoachSystemPrompt` agent 块
- Zod / `CoachToolName` 枚举仍留 `packages/shared`（契约真相源）

### 7. 明确不做（Phase 1）

- 迁 LangChain `ChatOpenAI` 换自动 trace
- Trace Worker 侧重任务（`PLAN_GENERATE_*`、`MEAL_VISION`、`MEMORY_EXTRACT`、`REPORT_ANALYZE`）
- 引入 LangSmith
- 用 Langfuse 替代 `AiRun` 持久化（`AiRun` 仍为业务真相源）
- 客户端打包 Langfuse Key

## Consequences

- **正面**：一轮 `COACH_CHAT` 可在 UI 看到 ReAct 时间线、分段 token、完整 prompt/observation；与 `aiRunId` 对账；免费档覆盖个人 demo 用量（约 5k–8k units/月）；异步上报不影响首 token
- **负面**：新依赖 `@langfuse/tracing`（或官方 Node SDK）；跨境 Cloud 上报偶发延迟/失败（不影响用户回复）；Phase 1 不解决 Prompt A/B（Phase 2）
- **对 ARCH §9**：LangSmith 仍为远期选项（全仓 LangChain 化 + 调用量上升时重评）；本 ADR 记录现阶段选型理由
- **对 ADR 0008**：`toolTrace` 摘要落库不变；Langfuse 存详情

## References

- PRD §5.3、§6；ARCHITECTURE §5、§9
- ADR 0005（自定义 LLM client）、0007/0008（Coach 会话与 Agent）
- `docs/issues/observability/README.md`（分切片实施）

## Status

Accepted · 2026-08-10
