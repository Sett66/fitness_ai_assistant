# REPORT-05 — healthContext 注入计划生成 + Coach

| 字段           | 值                          |
| -------------- | --------------------------- |
| **Type**       | AFK                         |
| **Blocked by** | [REPORT-02](./REPORT-02.md) |
| **Blocks**     | —                           |
| **估时**       | 1–2 天                      |
| **状态**       | ⬜ 未开工                   |

---

## 1. 目标

落地 ADR 0009 §8 的 **B 档**与 §12：把用户**最近一份 DONE 报告**（且在**12 个月新鲜度窗口**内）的 `healthContext` 自动注入**计划生成**（训练+饮食）与 **Coach system prompt**，使新计划规避健康风险、Coach 谈及体检不失忆。自动注入、**无用户开关**。**不改动已有计划**（不做 C）。

---

## 2. 背景

- 注入点先例：`UserContextService.mergePlanGeneratorInput`（现注入 profile/strength/todayNutrition）
- Coach 情景记忆注入：ADR 0008 §3、system prompt 构建 `packages/ai-core/src/chains/coach-chat/build-system-prompt.ts` 及 Agent 侧
- `healthContext` 由 REPORT-02 生成并落 `HealthReport.healthContext`

---

## 3. 前置阅读

1. [ADR 0009](../../adr/0009-health-report-analysis.md) §8、§12
2. `apps/api/src/domain/user-context.service.ts`
3. `packages/ai-core/src/graphs/plan-generator/`（schema + prompt）
4. `packages/ai-core/src/chains/coach-chat/build-system-prompt.ts` 与 Coach Agent system prompt 构建处

---

## 4. 详细规格

### 4.1 新鲜度窗口常量

`packages/shared/src/constants/health-report.ts`（或 limits.ts）：`HEALTH_CONTEXT_FRESHNESS_MONTHS = 12`。

### 4.2 领域服务：取最新可用 healthContext

在 `UserContextService`（或新 `HealthContextService`）加：

```
getLatestHealthContext(userId): Promise<string | null>
// 查最近一份 status=DONE、未软删、createdAt/reportDate 在 12 个月内的 HealthReport
// 返回其 healthContext（空则 null）
```

### 4.3 注入计划生成

- `mergePlanGeneratorInput` 增取 `healthContext`，塞入返回对象（如 `userContext.healthContext` 或顶层 `healthContext`）
- `plan-generator` 的 `WorkoutPlanGeneratorInputSchema` / `MealPlanGeneratorInputSchema` 增可选 `healthContext: z.string().optional()`
- `WORKOUT_PLAN_PROMPT` / `MEAL_PLAN_PROMPT` 增一段：「如提供健康约束（healthContext），在不违背训练目标前提下据此调整（如尿酸偏高降高嘌呤高蛋白、静息心率偏高控高强度有氧等）」

### 4.4 注入 Coach

- Coach system prompt 构建处增「【体检概况】」块（有 healthContext 才注入），风格与「【长期记忆】」块一致
- 覆盖 flag=false 的 `runCoachChatStream` 与 flag=true 的 Agent 两条路径（二者共用 system prompt 构建则改一处）
- 注入为**上下文**，**不**新增 `get_health_report` 工具

### 4.5 隐私

healthContext 为文本摘要，注入 prompt 属既有情景记忆范畴；日志不额外打印完整 healthContext（与坐标脱敏同理）。

---

## 5. 建议改动文件

| 路径                                                            | 动作                                       |
| --------------------------------------------------------------- | ------------------------------------------ |
| `packages/shared/src/constants/health-report.ts`                | 新鲜度窗口常量                             |
| `apps/api/src/domain/user-context.service.ts`                   | `getLatestHealthContext` + 注入 plan input |
| `packages/ai-core/src/graphs/plan-generator/schema.ts`          | 加可选 healthContext                       |
| `packages/ai-core/src/prompts/plan-generator.ts`                | prompt 增健康约束段                        |
| `packages/ai-core/src/chains/coach-chat/build-system-prompt.ts` | 体检概况块                                 |
| （Coach Agent system prompt 构建处）                            | 同步注入                                   |

---

## 6. Acceptance criteria

- [ ] `pnpm typecheck` 全仓通过
- [ ] 有 12 个月内 DONE 报告时，生成计划的 AiRun.inputJson 含 healthContext；超窗/无报告则不含
- [ ] 生成的计划在存在相关异常时体现规避（人工抽检 prompt 效果）
- [ ] Coach 对话能引用体检概况（如问「我血脂高训练注意啥」，回复贴合 healthContext）
- [ ] 仅注入**最近一份**（多报告时取最新 DONE）
- [ ] 单测：`getLatestHealthContext` 的新鲜度窗口边界（11 个月命中 / 13 个月不命中）

---

## 7. 验证步骤

```powershell
pnpm --filter shared build && pnpm typecheck
pnpm --filter api start:api
# 手测：先分析一份异常报告，再生成计划 / 问 Coach，观察是否带入健康约束
```

---

## 8. 不做

- 用户开关（默认全自动）
- 改动已有计划（C 档）
- `get_health_report` Agent 工具

---

## 9. 交付物 / 下游

| 交付物                          | 消费者                                |
| ------------------------------- | ------------------------------------- |
| `getLatestHealthContext` + 注入 | 计划生成、Coach；未来复盘 cron 可复用 |
