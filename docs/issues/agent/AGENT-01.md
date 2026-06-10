# AGENT-01 — ADR 0008：Coach Agent 与工具契约

| 字段           | 值                          |
| -------------- | --------------------------- |
| **Type**       | HITL（需人审 ADR 后合并）   |
| **Wave**       | W0                          |
| **Blocked by** | 无                          |
| **Blocks**     | AGENT-02, 03, 05, 06 及下游 |
| **估时**       | 0.5–1 天                    |
| **状态**       | ✅ 已完成 · 2026-06-04      |

---

## 1. 目标（Done 长什么样）

产出 **已 Accepted 的 ADR 0008**，作为后续所有 Agent Issue 的**唯一架构真相**。完成后，其他 Agent 可并行实现契约/Geo/记忆，而不会在「是否 function-calling」「工具跑在哪」上产生分歧。

**本 Issue 不写业务代码**（除 ADR 要求的文档同步）。若发现必须改代码才能验证决策，应新开 Issue 或记入 ADR Consequences。

---

## 2. 背景（你必须理解的现状）

### 2.1 当前 Coach 路径

- 移动端 Coach Tab 发 `CHAT` → `POST /v1/conversations/:id/messages/stream`（SSE）
- API [`ConversationsService.postMessageStream`](../../../apps/api/src/modules/conversations/conversations.service.ts) 同步调用 [`runCoachChatStream`](../../../packages/ai-core/src/chains/coach-chat/stream.ts)
- 注入 [`UserContextService.build`](../../../apps/api/src/domain/user-context.service.ts) 的 `UserAiContext` + 最近约 10 条 Message history
- 流结束后 `inferSuggestedActions` 推荐 `GENERATE_WORKOUT` / `GENERATE_MEAL` / `MEAL_VISION` 按钮
- **无** LLM 自主工具调用

### 2.2 ADR 0007 的显式限制

[`docs/adr/0007-coach-conversation-and-chat.md`](../../adr/0007-coach-conversation-and-chat.md) 写明：

> **不做** LLM function-calling 自动路由；副作用任务仍走显式 `action`

ADR 0008 将**修订**该点，但须保留 Worker 异步、卡片确认、日限等既有行为。

### 2.3 产品诉求（Epic 来源）

- 用户问「今天出门训练」→ 应查**真实天气**再建议
- 用户说「下周出差上海」→ **地理编码** + **周边健身房** POI
- **个性化**：跨会话记住偏好（伤病、常出差城市等）
- **定位**能力后续 M6 社区 `PartnerProfile` 复用

已决议：**高德** Web 服务（地理编码 + POI）；**Open-Meteo** 天气；M4 关闭后再做 Agent。

---

## 3. 前置阅读（按顺序）

1. [`docs/AGENT-ISSUES.md`](../../AGENT-ISSUES.md)
2. [`docs/adr/0007-coach-conversation-and-chat.md`](../../adr/0007-coach-conversation-and-chat.md)
3. [`docs/adr/0005-m3-ai-context-and-execution.md`](../../adr/0005-m3-ai-context-and-execution.md)
4. [`docs/adr/0003-modular-monolith-with-worker.md`](../../adr/0003-modular-monolith-with-worker.md)
5. [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md) §2–3

---

## 4. 硬性约束（ADR 必须体现）

| 约束       | 说明                                                                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 密钥位置   | DeepSeek、高德 Key **仅** `apps/api` 环境变量；移动端不得打包                                                                                 |
| 重任务执行 | `PLAN_GENERATE_*`、`MEAL_VISION` **仍在 BullMQ Worker**；Agent 通过 `enqueue_*` 工具创建 `AiRun`，不在 SSE HTTP 进程内调 Qwen-VL 或长计划生成 |
| 用户确认   | 计划/识图结果仍以 **卡片** 展示；不得 Agent 静默改 `Plan` / `MealLog`                                                                         |
| 回退       | `COACH_AGENT_ENABLED=false`（默认）时，行为与现网 `runCoachChatStream` **完全一致**                                                           |
| 记忆       | MVP **不做** 向量库 / RAG；长期记忆用关系表 `UserAgentMemory`                                                                                 |
| ReAct 上限 | 建议 5 轮 tool/次对话；须写明日限策略                                                                                                         |
| 坐标隐私   | 日志脱敏；`GET` 他人坐标不在本 Epic                                                                                                           |

---

## 5. ADR 0008 必须包含的章节

创建 [`docs/adr/0008-coach-agent-tools-and-memory.md`](../../adr/0008-coach-agent-tools-and-memory.md)，建议结构：

### 5.1 Context

- M4 Coach 已交付 SSE 流式；M5 目标真 Agent
- 0007 禁止 function-calling 的历史原因与本次修订动机

### 5.2 Decision

#### A. 编排形态

- `packages/ai-core`：LangGraph `StateGraph`，ReAct 循环（`messages` + `toolCalls` + `observations`）
- `apps/api`：`ToolRegistry` **执行**工具（HTTP、Prisma、Queue）；ai-core 只持 tool JSON schema
- `COACH_AGENT_ENABLED` feature flag 切换新旧路径

#### B. 工具清单（MVP）

| 工具名                      | 职责                             | 执行层       |
| --------------------------- | -------------------------------- | ------------ |
| `get_user_fitness_snapshot` | 包装 `UserContextService.build`  | API          |
| `get_weather`               | lat/lng 或城市 → Open-Meteo      | API          |
| `geocode_place`             | 文本 → 高德地理编码              | API          |
| `search_nearby_gyms`        | lat/lng + 半径 → 高德 POI        | API          |
| `enqueue_plan_generate`     | 入队 WORKOUT/MEAL 计划           | API + BullMQ |
| `enqueue_meal_vision`       | 入队 MEAL_VISION（需 objectKey） | API + BullMQ |

#### C. 记忆三层

| 层       | 来源                                      | 生命周期                   |
| -------- | ----------------------------------------- | -------------------------- |
| 工作记忆 | 当前会话 Message + 本轮 tool observations | 请求内                     |
| 情景记忆 | `UserAiContext`（档案、计划、今日营养）   | 每请求 build               |
| 长期记忆 | `UserAgentMemory` 表                      | 跨会话；对话成功后异步抽取 |

#### D. SSE 契约扩展

在现有 `accepted` / `delta` / `done` / `error` 上增加：

- `tool_start`: `{ name: CoachToolName, label?: string }`
- `tool_end`: `{ name, ok: boolean, summary?: string }`

`AiRun.outputJson` 与 `Message.metadata` 增加 `toolTrace[]`。

#### E. 外部服务

- **高德**：`AMAP_WEB_KEY`（及控制台要求的 secret 字段名写进 ADR）
- **Open-Meteo**：无 Key；服务端 HTTP
- 健身房 POI 类型码须在 ADR 注明（如高德 `types` 参数，实施时 AGENT-03 落地）

#### F. 位置数据

- 移动端可选 `locationContext` 随 CHAT 上报
- 服务端 `UserLocationSnapshot` 表（推荐）或 Profile 扩展；`PUT/GET /v1/users/me/location`（AGENT-09）
- 与 `PartnerProfile.lng/lat/city` 字段语义对齐，供 M6 社区

#### G. 日限

保留 0007 表；新增**按工具**日限的建议值（如 `get_weather` 10/用户/日），实现方式（Redis vs 聚合 `ai_runs`）可二选一写入 ADR。

### 5.3 Consequences

- 正面：真工具调用、可审计 `toolTrace`、社区可复用定位
- 负面：延迟增加、LangGraph 依赖、高德 Key 运维
- 对 0007：标注 **Superseded by 0008**（正文保留）

### 5.4 Status

`Accepted · YYYY-MM-DD`（人审后填日期）

---

## 6. 同步文档（本 Issue 范围内）

| 文件                                                                                            | 改动                                                                                            |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`docs/adr/0007-coach-conversation-and-chat.md`](../../adr/0007-coach-conversation-and-chat.md) | 文首增加 `> Superseded by [0008](0008-coach-agent-tools-and-memory.md) for Agent/tool-calling.` |
| [`docs/ARCHITECTURE.md`](../../ARCHITECTURE.md) §3                                              | `ai-core/graphs/coach-agent`、`memory/`、`api/domain/agent/` 与 ADR 一致                        |
| [`README.md`](../../../README.md)                                                               | M5 小节增加一句 Agent 入口：`docs/issues/agent/README.md`                                       |
| [`docs/AGENT-ISSUES.md`](../../AGENT-ISSUES.md)                                                 | 若 ADR 与草案有差异，以 ADR 为准更新工具表                                                      |

---

## 7. 明确不做（写入 ADR「不做」）

- SSE 进程内跑 Qwen-VL / 完整计划 JSON 生成
- 客户端 function-calling 或直连地图 API
- 向量记忆、全网爬虫健身房
- LangGraph 可视化平台、多 Agent 协作
- 在本 Epic 内加厚饮食计划内容（见 `MEAL-QUALITY-01.md`）

---

## 8. Acceptance criteria

- [x] `docs/adr/0008-coach-agent-tools-and-memory.md` 存在且 Status 为 Accepted
- [x] 工具清单、记忆策略、SSE 事件、feature flag、日限、不做项均已写明
- [x] ADR 0007 已标注 Superseded，原文未删
- [x] ARCHITECTURE + README 已同步
- [x] 下游 Issue（02–10）引用的工具名与 ADR 表一致

---

## 9. 验证步骤

1. 请另一位维护者或本人通读 ADR，确认与 ADR 0003/0005/0007 无矛盾
2. 对照 [`AGENT-02.md`](./AGENT-02.md) 契约列表，确认 enum 名可在 ADR 找到
3. 无需跑 `pnpm test`（无代码变更时）

---

## 10. 交付物 / 下游依赖

| 交付物               | 消费者                                                       |
| -------------------- | ------------------------------------------------------------ |
| ADR 0008 正文        | AGENT-02（契约 enum）、03（高德）、05（记忆表）、06（Graph） |
| `CoachToolName` 命名 | shared Zod（AGENT-02）                                       |
| SSE 事件名           | shared + mobile coach stream（AGENT-06/07）                  |

**合并本 Issue 后**，W1 的 AGENT-02/03/04/05 可并行开工。
