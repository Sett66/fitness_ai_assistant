# 0008 — Coach 真 Agent：LangGraph ReAct、服务端 ToolRegistry 与分层记忆

## Context

M4 已交付 Coach Tab：多轮对话、`POST /v1/conversations/:id/messages/stream`（SSE）、`UserAiContext` 注入、显式 `action` 触发计划/识图（ADR [0007](./0007-coach-conversation-and-chat.md)）。

0007 明确 **不做** LLM function-calling 自动路由，以避免 M4 工期内在「聊天 vs 重任务」上耦合过深。M4 关闭后，产品需要：

- 根据**真实天气**回答户外训练建议
- 根据**出差地点**查询周边健身房（地理编码 + POI）
- **跨会话**记住稳定偏好（伤病、器械偏好、常出差城市等）
- 对话中可**派发**训练/饮食计划与餐照识别，行为与现有按钮一致

同时须保留 ADR [0003](./0003-modular-monolith-with-worker.md)（重任务 Worker 异步）、[0005](./0005-m3-ai-context-and-execution.md)（服务端注入用户上下文）、0007（卡片确认、日限、Conversation 持久化）。

**已决议（Epic）**：地图/POI 用**高德 Web 服务**；天气用 **Open-Meteo**（服务端 HTTP、无 Key）；文本 LLM 仍走现有 DeepSeek 直连（不改为硅基免费模型）。

## Decision

### 1. 编排形态

| 层                 | 职责                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ai-core` | LangGraph `StateGraph`：ReAct 循环（`messages` → 可选 `toolCalls` → `observations` → 直至生成最终回复）；导出 tool JSON schema 与 `runCoachAgentStream` |
| `apps/api`         | `ToolRegistry` **执行**工具（Prisma、HTTP、BullMQ）；`CoachAgentRunner` 桥接 SSE                                                                        |
| `packages/shared`  | `CoachToolName`、SSE 事件、`LocationContext`、`CoachToolTrace` 等 Zod 契约                                                                              |

**Feature flag**：`COACH_AGENT_ENABLED`（默认 `false`）。

- `false`：`ConversationsService.postMessageStream` 仍调用 `runCoachChatStream`（与 M4 完全一致）
- `true`：走 `CoachAgentRunner` + LangGraph

依赖：在 `packages/ai-core` 引入 `@langchain/langgraph`、`@langchain/core`（Node 22）。

### 2. 工具清单（MVP）

所有 function-calling **仅在服务端**；移动端不得持有地图/LLM Key。

| `CoachToolName`             | 职责                                                | 执行位置                           | 说明                                                 |
| --------------------------- | --------------------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| `get_user_fitness_snapshot` | 档案、今日营养、活跃计划摘要                        | API · `UserContextService`         | 包装现有情景记忆                                     |
| `get_weather`               | 气温、降水、风力与训练提示素材                      | API · `WeatherClient` (Open-Meteo) | 输入 `lat/lng` 或经 geocode 的城市                   |
| `geocode_place`             | 文本 → 坐标与城市名                                 | API · `AmapClient`                 | 如「上海市」「杭州西湖区」                           |
| `search_nearby_gyms`        | 周边健身房 POI                                      | API · `AmapClient`                 | 默认半径 3000m，最多 5 条                            |
| `enqueue_plan_generate`     | 入队 `PLAN_GENERATE_WORKOUT` / `PLAN_GENERATE_MEAL` | API · BullMQ                       | 复用 `ConversationSideEffectService` 卡片链路        |
| `enqueue_meal_vision`       | 入队 `MEAL_VISION`                                  | API · BullMQ                       | 需 `imageObjectKey`；无图则返回 clarification 给模型 |

**重任务边界**：`enqueue_*` 只创建 `AiRun` + 入队；**不在** SSE HTTP 进程内调用 `runMealPlanGenerator`、`runMealVision`（Qwen-VL）或同步长计划生成。

**Prompt 约束**：有工具 observation 时不得编造天气/POI/摄入数据；不得在正文输出完整多周计划表（延续 Coach 流式规则）。

**ReAct 上限**：每轮 `COACH_CHAT` 最多 **5** 次 tool 调用；超限则终止工具环并基于已有 observation 生成回复或返回可读错误。

### 3. 记忆分层

| 层           | 机制                                                         | 存储                                                                                                                |
| ------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **工作记忆** | 当前会话最近 Message（上限约 20 条）+ 本轮 tool observations | 请求内                                                                                                              |
| **情景记忆** | `UserAiContext`（`UserContextService.build`）                | 每请求注入 system prompt                                                                                            |
| **长期记忆** | 稳定事实（伤病、偏好、常出差城市等）                         | 表 `UserAgentMemory`：`userId`, `key`, `value`, `confidence`, `sourceMessageId?`, `updatedAt`；唯一 `(userId, key)` |

长期记忆**写入**：`COACH_CHAT` 成功结束后**异步** job 调用 `extractMemoryFacts` → upsert（失败不影响当轮 `DONE`）。

长期记忆**读取**：注入 system prompt「【长期记忆】」块，最多 20 条，按 `updatedAt` 降序。

**不做**：向量库、embedding RAG、全量对话摘要入库（M6+ 再评估）。

### 4. HTTP / SSE 契约

#### 4.1 请求扩展

`CreateCoachMessageSchema` 增加可选 `locationContext`：

```ts
{ lat, lng, accuracyM?, city?, capturedAt }  // ISO datetime
```

写入 `Message.metadata` 与 `AiRun.inputJson` 备查。

#### 4.2 SSE 事件（在 0007 基础上扩展）

| event        | payload（Zod 在 shared）                       |
| ------------ | ---------------------------------------------- |
| `accepted`   | 不变                                           |
| `tool_start` | `{ name: CoachToolName, label?: string }`      |
| `tool_end`   | `{ name, ok: boolean, summary?: string }`      |
| `delta`      | 不变                                           |
| `done`       | 可增加 `toolTrace?`；`suggestedActions` 仍可选 |
| `error`      | 不变                                           |

#### 4.3 持久化扩展

- `AiRun.outputJson`：`{ reply, suggestedActions?, toolTrace?: CoachToolTraceItem[] }`
- `Message.metadata`（ASSISTANT）：同步 `toolTrace`、`taskStatus`

`CoachToolTraceItem`：`{ name, inputSummary?, outputSummary?, durationMs, ok }`（摘要须脱敏坐标）。

#### 4.4 位置 HTTP（AGENT-09）

- `PUT /v1/users/me/location`、`GET /v1/users/me/location`
- 存储：`UserLocationSnapshot`（`userId`, `lat`, `lng`, `city?`, `source: GPS | MANUAL | GEOCODE`, `createdAt`）
- 语义与 `PartnerProfile`（`city`, `lng`, `lat`）对齐，供 M6 社区复用
- **无** `GET /users/:id/location`（他人坐标不在本 Epic 开放）

### 5. 外部服务与环境变量

| 服务          | 用途               | 环境变量                                                 | Key         |
| ------------- | ------------------ | -------------------------------------------------------- | ----------- |
| Open-Meteo    | 天气预报           | （可选 `OPEN_METEO_BASE_URL`，默认官方 API）             | 无          |
| 高德 Web 服务 | 地理编码、周边 POI | `AMAP_WEB_KEY`；若控制台要求签名则增加 `AMAP_WEB_SECRET` | 服务端 only |
| DeepSeek      | Agent LLM          | 现有 `DEEPSEEK_*`                                        | 不变        |

**健身房 POI**：高德周边搜索 `types=080113`（体育休闲服务-运动场馆，含健身房）；若结果稀疏，可补充 `keywords=健身房`（AGENT-03 实现细节）。

**隐私**：日志中 `lat/lng` 四舍五入至 2 位小数；`toolTrace.inputSummary` 不记录精确坐标。

### 6. 日限

保留 ADR 0007 `taskType` 日限：

| taskType                | 日限 |
| ----------------------- | ---- |
| `COACH_CHAT`            | 30   |
| `PLAN_GENERATE_WORKOUT` | 2    |
| `PLAN_GENERATE_MEAL`    | 2    |
| `MEAL_VISION`           | 10   |

**工具日限**（MVP 建议值，按用户自然日、客户端 `timezoneOffsetMinutes`）：

| 工具                        | 日限/用户                 |
| --------------------------- | ------------------------- |
| `get_weather`               | 10                        |
| `geocode_place`             | 20                        |
| `search_nearby_gyms`        | 10                        |
| `get_user_fitness_snapshot` | 30（与 CHAT 同量级）      |
| `enqueue_plan_generate`     | 受 `PLAN_GENERATE_*` 约束 |
| `enqueue_meal_vision`       | 受 `MEAL_VISION` 约束     |

**实现**：优先聚合当日 `AiRun`（`taskType=COACH_CHAT`）的 `outputJson.toolTrace` 计数，避免 MVP 引入 Redis 新依赖；超限返回 observation 中文提示，不 HTTP 500。

### 7. 移动端

- 保留 Coach 显式按钮（生成计划、餐照、手动记餐）与 Agent 工具**并行**
- `features/location/`：Android 定位权限；LBS 相关 CHAT 可附带 `locationContext`（懒请求）
- 流式 UI 展示 `tool_start` / `tool_end`（如「正在查询天气…」）

### 8. 实施分期（对应 `docs/issues/agent/`）

| Wave | Issues   | 交付                                  |
| ---- | -------- | ------------------------------------- |
| W0   | AGENT-01 | 本 ADR                                |
| W1   | 02–05    | 契约、Geo、定位、记忆                 |
| W2   | 06       | Graph + `get_user_fitness_snapshot`   |
| W3   | 07–09    | 天气/POI、enqueue、位置 API           |
| W4   | 10       | `m5-agent-acceptance.ps1`、HANDOFF-M5 |

### 9. 明确不做（本 Epic）

- SSE 进程内跑 Qwen-VL 或完整计划 JSON 生成
- 客户端 function-calling 或直连地图/LLM API
- 向量记忆、爬虫健身房目录
- LangGraph Studio / 多 Agent 协作
- Agent 静默写入 `Plan` / `MealLog`（仍须卡片确认）
- 在本 Epic 内加厚饮食计划食材库（见 `MEAL-QUALITY-01`）

## Consequences

- **正面**：可审计 `toolTrace`；天气/POI 可验证；长期记忆提升个性化；定位与 M6 社区共用；`COACH_AGENT_ENABLED=false` 保证回退
- **负面**：延迟与 token 成本上升；LangGraph 新依赖；高德 Key 运维与配额；免费/小模型不在本 Epic 讨论
- **对 0007**：§2 COACH_CHAT「不做 function-calling」由本 ADR 取代；Conversation/Message/Worker 卡片/日限/显式 action **仍然有效**

## References

- ADR 0003（Worker）、0005（UserContext）、0007（Coach 会话）
- `docs/issues/agent/README.md`（分 Issue 实施文档）
- `docs/AGENT-ISSUES.md`

## Status

Accepted · 2026-06-04
