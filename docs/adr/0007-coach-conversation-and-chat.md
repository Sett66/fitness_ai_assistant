# 0007 — Coach 统一入口：Conversation/Message 持久化与 COACH_CHAT

> **Superseded（部分）**：[0008 — Coach 真 Agent](./0008-coach-agent-tools-and-memory.md) 取代本文 §2 关于「不做 LLM function-calling」的决策，并扩展 SSE 工具事件与记忆。本文其余部分（Conversation 模型、Worker 卡片、日限、显式 `action`）**仍然有效**。

## Context

M4 移动端将 Plan Tab 与 Nutrition Tab 的 AI 能力合并为 **Coach Tab**（首页 + Coach + 打卡 + 社区占位 + 我的）。产品要求：

- 多轮对话，结合用户档案与聊天历史回复
- 显式触发：生成训练/饮食计划、餐照识别、手动记餐
- 为 M6 Social 模块预留 Tab 位

ADR 0005 明确 M3 不做 Conversation 表；M4 Coach 集成需要补齐该能力，同时 **保留 ADR 0003** 异步 Worker 链路与现有 plan-generator / meal-vision 链作为「工具」。

## Decision

### 1. 数据模型

新增 `Conversation`、`Message` 表；`AiRun` 增加 `conversationId`、`triggerMessageId` 可选关联。

- `MessageContentType`：`TEXT` | `IMAGE` | `PLAN_CARD` | `MEAL_VISION_CARD` | `SYSTEM_NOTICE`
- `MessageRole`：`USER` | `ASSISTANT` | `SYSTEM`
- 每用户一个 `isDefault=true` 的默认会话（懒创建）

### 2. 新 taskType：`COACH_CHAT`

- 普通健身问答：DeepSeek 多轮 messages + `UserAiContext` 注入
- **不做** LLM function-calling 自动路由；副作用任务（计划生成、识图）仍走显式 `action` 映射到现有 `PLAN_GENERATE_*` / `MEAL_VISION`

### 3. HTTP API

| 端点                                  | 说明                                    |
| ------------------------------------- | --------------------------------------- |
| `GET /v1/conversations/default`       | 默认会话 + 最近 50 条 Message           |
| `GET /v1/conversations/:id/messages`  | 分页历史                                |
| `POST /v1/conversations/:id/messages` | 统一写入：USER Message → AiRun → BullMQ |

保留 `POST /v1/ai/tasks` 供脚本 / Onboarding。

Worker 完成后由 `ConversationSideEffectService` 写入/更新 ASSISTANT Message（含卡片类型）。

### 4. 日限额拆分

| taskType                | 日限 |
| ----------------------- | ---- |
| `COACH_CHAT`            | 30   |
| `PLAN_GENERATE_WORKOUT` | 2    |
| `PLAN_GENERATE_MEAL`    | 2    |
| `MEAL_VISION`           | 10   |

### 5. 移动端

- Coach Tab 统一 AI 入口；PlanList 迁入 Workout Stack
- 轮询 `GET /v1/ai/tasks/:id` 不变
- 计划/识图结果以卡片展示，需确认后再落库（识图默认 `saveMealLog: false`）

## Consequences

- **正面**：真多轮持久化；单一 AI 入口；Social Tab 占位不影响 MVP 闭环
- **负面**：schema migration；Worker 需写回 Message；聊天与重任务 UX 仍依赖轮询
- **后续**：~~SSE/WebSocket 推送、LLM 意图路由、LangGraph 编排~~ → SSE 流式与 LangGraph Agent 见 ADR 0008

## References

- ADR 0003（Worker 异步）、ADR 0005（UserContext 注入）
- `docs/HANDOFF-M4.md` §5

## Status

Accepted · 2026-05-28
