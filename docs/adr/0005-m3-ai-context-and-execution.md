# 0005 — M3 AI 执行：单轮编排、用户上下文注入、餐照二阶段与 Plan 落库

## Context

M3 需在 [`packages/ai-core`](../packages/ai-core) 落地真实 LLM，并由 [`apps/api`](../apps/api) Worker 消费 BullMQ 队列（ADR 0003）。产品侧还要求：

- 训练/饮食计划生成能利用**用户档案、力量水平、已有计划与今日摄入**（会话级「懂用户」的 MVP，见 PRD §5.2 / §5.3）。
- 餐照识别后除菜品热量外，能回答**今日已摄入、剩余配额、晚餐怎么吃**（PRD F5 延伸）。
- 计划生成结果应进入 **`Plan` 相关表**，而非仅停留在 `AiRun.outputJson`。

[`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §3 将 `plan-generator` 描述为 LangGraph 状态机；M3 工期与 HANDOFF-M3 允许「**可先最小单节点再扩**」。同时 DeepSeek 开放平台已将部分账号的可用模型迁移至 **V4**（`deepseek-v4-pro` / `deepseek-v4-flash`），`deepseek-v3.2` 可能直接报错。

## Decision

### 1. 编排形态：单轮 LLM + Zod，M3 不引入 LangGraph 库

- **`plan-generator`**、**`meal-vision` 识图阶段**均为：Prompt 模板 → `generateJson`（OpenAI-compatible）→ [`parseJsonWithSchema`](../packages/ai-core/src/parsers/json-zod.ts)。
- **不在 M3 依赖** `@langchain/langgraph`；README / ARCH 中「LangGraph」指**逻辑阶段**（生成→校验），非强制使用该 npm 包。
- 解析失败抛 `AI_TASK_PARSE_FAILED`，由 BullMQ 任务重试（最多 3 次，PRD §5.3）；**不在 ai-core 内做 LLM 二次生成循环**（后续若需要可再加 Graph 节点）。

### 2. 模型与客户端

| 用途                   | 模型常量（`LLM_MODELS`）                                                       | 客户端                                        |
| ---------------------- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| 计划生成、餐照文案建议 | `deepseek-v4-pro`（默认）；可选 `deepseek-v4-flash`、`DEEPSEEK_MODEL` env 覆盖 | `llm/deepseek.ts`                             |
| 餐食图像识别           | `qwen-vl-max`                                                                  | `llm/qwen-vl.ts`（DashScope compatible-mode） |

- HTTP 投递的 `model` 字段仍为字符串（`LlmModelSchema`），Worker 按名选客户端（`factory.ts`）。
- 保留 `DEEPSEEK_V3_2` 常量仅作兼容说明，**新调用应使用 V4**。

### 3. 用户上下文：Worker 注入，而非要求客户端拼全量 Profile

新增 **`apps/api/src/domain/`**（`UserContextService`、`NutritionDailyService`）：

- 在 `PLAN_GENERATE_*` 派发前，将 DB 中的 **Profile、StrengthLevel（近 20 条）、活跃 Plan 摘要、今日 MealLog 汇总** 合并进 `inputJson`（`userContext` + 顶层 `profile` / `strengthLevels`）。
- 客户端只需传 **`notes`、`mesocycleWeeks`、`timezoneOffsetMinutes`** 等增量字段。
- 今日营养使用 **Mifflin-St Jeor × 活动系数 × 目标系数**（[`nutrition-tdee.ts`](../packages/shared/src/utils/nutrition-tdee.ts)），与 PRD §5.2 系数一致；按 `timezoneOffsetMinutes`（默认 480）划本地自然日。

**多轮对话表（`Conversation` / `Message`）不在 M3 范围**；会话式偏好通过 `inputJson.notes` 与上述快照满足 MVP。

### 4. 餐照：`MEAL_VISION` 二阶段与扩展契约

**阶段 1（Qwen-VL）**：图片 → `items[]`（`MealVisionItemsOnlySchema`，仅菜品结构）。

**阶段 2（DeepSeek，可选）**：当 Worker 能构建 `NutritionDailySummary` 时调用 `runMealVisionWithAdvice`，输出：

- `nutritionContext`：今日目标/已摄入/剩余、`pendingMeals`
- `advice`：`summary`、`mealImpact`、可选 `dinnerSuggestion`

契约见 [`MealVisionResultSchema`](../packages/shared/src/schemas/nutrition.ts)、[`MealVisionTaskInputSchema`](../packages/shared/src/schemas/nutrition.ts)。

**图片输入**（二选一，Zod refine）：

- `imageUrl`：须 **Qwen 服务端可下载**（公网 URL）；
- `objectKey`：Worker 调用 **`presignGet`**（ADR 0004 扩展）生成短时 GET URL。

本地 MinIO 若仅 `127.0.0.1`，DashScope **无法拉图** → 开发期用公网示例图，或配置 **`S3_PUBLIC_ENDPOINT`** 可达地址。

**`saveMealLog`（默认 true）**：识别成功后写入 `MealLog`（`source: VISION`，条目 `AI_ESTIMATE`），并回写 `mealLogId`。

### 5. Plan 落库：AI 成功后事务写入，旧 ACTIVE 计划完成

`PlanPersistenceService` 在 `PLAN_GENERATE_WORKOUT` / `PLAN_GENERATE_MEAL` **DONE** 后：

1. 将同用户、同 `type` 的 **`ACTIVE` → `COMPLETED`**；
2. 创建新 `Plan`（`status: ACTIVE`，`aiRunId` 关联）及 `WorkoutPlanDay` / `MealPlanDay` 子表；
3. `outputJson` 中附带 **`planId`** 供客户端跳转。

**动作解析**：按 `exerciseName` 匹配 preset `Exercise.nameZh`（含子串）；未命中则**跳过该项**并打日志（seed 仅 5 条时常见）。不在 M3 自动创建 catalog 动作。

### 6. 新增 HTTP（M3 增量）

- `GET/POST/DELETE /v1/meal-logs`
- `GET /v1/meal-logs/daily-summary`

供移动端与餐照链路读取今日摄入；**不**改变 AI 异步主路径（仍 `POST /v1/ai/tasks`）。

## Consequences

- **正面**：M3 垂直切片可测；移动端只需任务投递 + 轮询；营养建议可解释、可落库；Plan 与 `AiRun` 双轨可查。
- **负面**：无 LangGraph 可视化与节点级 retry；计划质量依赖单次 Prompt；动作 seed 不足时计划项稀疏；餐照 E2E 依赖图片 URL 可达性。
- **后续**（M3+ / M4 并行）：`GET /v1/plans/:id`、Workout 打卡 HTTP、`Conversation` 表、LangGraph 多节点、LLM 解析失败自动重生成、`MESOCYCLE_REVIEW` Worker 分支。

## References

- [`docs/HANDOFF-M3.md`](../HANDOFF-M3.md)、[`docs/HANDOFF-M3-AGENT.md`](../HANDOFF-M3-AGENT.md)
- [`docs/HANDOFF-M4.md`](../HANDOFF-M4.md) §5（移动端集成）
- ADR 0003（Worker 异步）、ADR 0004（上传 + presignGet）

## Status

Accepted · 2026-05-19
