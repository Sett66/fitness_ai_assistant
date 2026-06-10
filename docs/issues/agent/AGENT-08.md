# AGENT-08 — Agent 派发重任务（计划 / 识图）

| 字段           | 值                        |
| -------------- | ------------------------- |
| **Type**       | AFK                       |
| **Wave**       | W3                        |
| **Blocked by** | [AGENT-06](./AGENT-06.md) |
| **Blocks**     | AGENT-10                  |
| **估时**       | 2 天                      |

---

## 1. 目标

Agent 在对话中可 **入队** 现有 BullMQ 重任务，行为与 Coach 显式按钮一致：

- `enqueue_plan_generate` → `PLAN_GENERATE_WORKOUT` / `PLAN_GENERATE_MEAL`
- `enqueue_meal_vision` → `MEAL_VISION`

用户说「帮我生成一份饮食计划」应得到 **taskId + 后续卡片**，而非聊天正文里贴完整周计划表。

---

## 2. 背景

### 2.1 现有非 Agent 路径

[`postMessage`](../../../apps/api/src/modules/conversations/conversations.service.ts)（非 stream）：

- `buildAiRunPayload` 按 `action` 映射 taskType
- `queue.add` → Worker [`AiTaskProcessor`](../../../apps/api/src/workers/ai-task.processor.ts)
- [`ConversationSideEffectService`](../../../apps/api/src/domain/conversation-side-effect.service.ts) 写 PLAN_CARD / MEAL_VISION_CARD

### 2.2 ADR 约束

- 日限：WORKOUT/MEAL 各 2/日，MEAL_VISION 10/日（0007）
- 识图默认 `saveMealLog: false`（Coach 路径）
- Agent **不得**在 SSE 内同步跑 `runMealPlanGenerator`

---

## 3. 前置阅读

1. [AGENT-06](./AGENT-06.md)
2. [`conversations.service.ts`](../../../apps/api/src/modules/conversations/conversations.service.ts) `buildAiRunPayload`、`postMessage`
3. [`conversation-side-effect.service.ts`](../../../apps/api/src/domain/conversation-side-effect.service.ts)

---

## 4. 详细规格

### 4.1 `enqueue_plan_generate`

**Input schema**（Zod，放 shared 或 tool-registry 内）：

```ts
{
  planType: 'WORKOUT' | 'MEAL';
  mesocycleWeeks?: number;  // default 4
  notes?: string;
  preferences?: WorkoutPlanPreferences;  // WORKOUT only
}
```

**执行逻辑**：

1. `assertDailyLimit(userId, taskType)` — 与现网相同
2. 创建新 `AiRun` QUEUED + 关联 `conversationId`（从 ToolContext）
3. **关键**：需创建/更新 ASSISTANT Message 为 pending 卡片态，与 `postMessage` 非 CHAT 行为对齐
   - 复用 `ConversationSideEffectService` 或抽 `enqueueConversationTask()` 共用函数
4. `queue.add({ aiRunId })`
5. observation 返回：`{ taskId, planType, message: '已提交生成，请在对话中查看进度' }`

**Graph 行为**：模型应在正文简短确认 + 不再输出周计划表格。

### 4.2 `enqueue_meal_vision`

**Input**：

```ts
{
  imageObjectKey?: string;
  mealType?: MealType;
  saveMealLog?: boolean;  // default false
}
```

**逻辑**：

- 无 `imageObjectKey`：不创建 AiRun；observation：`请用户上传餐照（使用 App 附件菜单）`
- 有 key：同现网 `MEAL_VISION` payload 入队

**限制**：Agent 对话中通常无图；本工具主要用于模型**引导**用户点附件，而非凭空识图。

### 4.3 与显式按钮共存

- [`ChatComposer`](../../../apps/mobile/src/features/coach/components/ChatComposer.tsx) 保留「训练计划」「饮食计划」「餐照」
- `suggestedActions` 仍可推荐按钮（`inferSuggestedActions`）
- Agent enqueue 与按钮 **共用** Worker，不 duplicate processor

### 4.4 Prompt 规则

- 用户明确要计划 → 调用 `enqueue_plan_generate`，不要手写 4 周表格
- 用户发图意图 → 若无 objectKey，提示用 UI 上传
- 日限用尽 → observation 转述限额错误

### 4.5 `done` 事件扩展（可选）

若 enqueue 发生在同一轮 CHAT 内，SSE `done` 的 `suggestedActions` 可含 `{ action: 'GENERATE_MEAL', label: '查看计划进度' }` —— **非必须**，卡片出现即可。

---

## 5. 建议改动文件

| 路径                                                           | 动作              |
| -------------------------------------------------------------- | ----------------- |
| `tool-registry.service.ts`                                     | 2 工具            |
| `tools-schema.ts`                                              | function defs     |
| `conversations.service.ts` 或新 `conversation-task.service.ts` | 抽取 enqueue 共用 |
| `coach-system.ts`                                              | enqueue 规则      |

**避免**：复制 `AiTaskProcessor` 逻辑。

---

## 6. Acceptance criteria

- [ ] 对话请求饮食计划 → 出现与按钮相同的 pending/卡片流程；Worker DONE 后 PLAN_CARD
- [ ] 日限 2 次后第三次 enqueue 返回可读错误
- [ ] 无图识图请求 → 助手引导上传，不 FAILED
- [ ] `COACH_AGENT_ENABLED=true` 下训练计划 enqueue 仍消耗 `PLAN_GENERATE_WORKOUT` 日限
- [ ] 显式按钮路径回归通过

---

## 7. 验证步骤

```powershell
COACH_AGENT_ENABLED=true
pnpm --filter api start:worker
pnpm --filter api start:api
# Coach: 「帮我生成 4 周饮食计划」
# 观察 ai_runs.task_type = PLAN_GENERATE_MEAL
# 等待 Worker -> PLAN_CARD message
```

---

## 8. 不做

- 在 Agent 正文生成完整 plan JSON
- 自动 `saveMealLog: true`（除非用户明确要求，可记后续）
- 加厚计划内容（见 MEAL-QUALITY-01）

---

## 9. 交付物 / 下游

| 交付物              | 消费者                  |
| ------------------- | ----------------------- |
| 共用 enqueue helper | 减少 conversations 重复 |
| enqueue 工具        | AGENT-10 验收           |
