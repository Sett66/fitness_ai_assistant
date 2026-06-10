# MEAL-QUALITY-01 — 饮食计划与食物库对齐

| 字段           | 值                                 |
| -------------- | ---------------------------------- |
| **Type**       | AFK                                |
| **Epic**       | 并行轨道（**非** Coach Agent MVP） |
| **Wave**       | 与 Agent W1 可并行                 |
| **Blocked by** | 无                                 |
| **Blocks**     | 无                                 |
| **估时**       | 2–4 天                             |

---

## 1. 目标

提高 **饮食计划生成** 与 **食物库** 的一致性，解决「计划里食材自由发挥、与 DB 脱节」问题。

**不**增加 LangGraph、不增加 mesocycle 复杂度；对齐训练计划已有的 `availableExerciseNames` + 落库匹配模式。

---

## 2. 背景（必读）

当前实现**不读**食物库：

| 环节        | 训练计划                          | 饮食计划                  |
| ----------- | --------------------------------- | ------------------------- |
| Worker 注入 | `availableExerciseNames`          | **无**                    |
| Prompt      | 必须从列表选 `exerciseName`       | 任意 `dishName`           |
| 落库        | `resolveExerciseId`，未匹配则跳过 | 原样存 `ingredients` JSON |

相关文件：

- [`MEAL_PLAN_PROMPT`](../../../packages/ai-core/src/prompts/plan-generator.ts)
- [`mergePlanGeneratorInput`](../../../apps/api/src/domain/user-context.service.ts)（仅注入 exercises）
- [`persistMealPlan`](../../../apps/api/src/domain/plan-persistence.service.ts)（无 food 解析）
- [`seed.ts`](../../../packages/db/prisma/seed.ts) 仅 **10** 条官方食物；且已有食物时 **跳过** seed

---

## 3. 前置阅读

1. [`docs/adr/0005-m3-ai-context-and-execution.md`](../../adr/0005-m3-ai-context-and-execution.md) § Plan 落库
2. [`packages/db/prisma/seeds/exercises/`](../../../packages/db/prisma/seeds/exercises/)（模块化 seed 参考）
3. [`ManualMealSheet`](../../../apps/mobile/src/features/nutrition/components/ManualMealSheet.tsx)（食物库 UX）

---

## 4. 详细规格

### 4.1 扩展食物库 seed

- 新建 `packages/db/prisma/seeds/foods/` 分文件（如 `proteins.ts`, `carbs.ts`, `vegetables.ts`）
- 目标 **50–80** 条常见健身食材（中文名 + per100g 营养，USDA 近似即可）
- **Upsert 策略**：按 `nameZh` + `source=OFFICIAL` 查找，存在则跳过或可选更新；**不要**整批 `count>0` 就跳过（修复现有 `seedOfficialFoods` 逻辑）
- 更新 [`verify-seed.mjs`](../../../packages/db/scripts/verify-seed.mjs) 的 `OFFICIAL_FOOD_COUNT`

### 4.2 Worker 注入 `availableFoodNames`

在 `UserContextService.mergePlanGeneratorInput`（或仅 `PLAN_GENERATE_MEAL` 分支）：

```ts
availableFoodNames: foods.map((f) => f.nameZh); // take 100, 同 exercises
```

### 4.3 更新 `MEAL_PLAN_PROMPT`

增加要求（对齐 WORKOUT prompt）：

- `ingredients[].dishName` 应优先从 `availableFoodNames` **精确选择**
- 可搭配组合，但单品名不得自造不在列表的名称（列表外极少数可用 dishName 并注明「近似」—— 可收紧为完全禁止）

### 4.4 `persistMealPlan` 解析 `foodId`

仿 `resolveExerciseId`：

```ts
private resolveFoodId(dishName: string, index: Map<string, string>): string | null
// 精确 + 子串匹配
```

写入 `MealPlanItem.ingredients` JSON 时填充 `foodId`（schema 已支持 optional `foodId`）。

未匹配：**仍保留** ingredient 行，打 `Logger.warn`，不丢项。

### 4.5 测试

- seed verify 脚本通过
- 单元测试：`resolveFoodId` 精确/子串
- 可选：mock LLM 输出固定 JSON → `persistMealPlan` 含 foodId

---

## 5. 建议改动文件

| 路径                                  | 动作                             |
| ------------------------------------- | -------------------------------- |
| `packages/db/prisma/seeds/foods/*`    | 新建                             |
| `packages/db/prisma/seed.ts`          | upsert foods                     |
| `packages/db/scripts/verify-seed.mjs` | 计数                             |
| `user-context.service.ts`             | availableFoodNames               |
| `plan-generator.ts`                   | prompt                           |
| `plan-persistence.service.ts`         | resolveFoodId                    |
| `MealPlanGeneratorInputSchema`        | optional availableFoodNames 字段 |

---

## 6. Acceptance criteria

- [ ] `pnpm --filter db verify:seed` 通过新食物数量
- [ ] 生成 MEAL 计划后，`meal_plan_item.ingredients` 中部分条目含 `foodId`
- [ ] `availableFoodNames` 传入 `runMealPlanGenerator` 的 inputJson（日志或单测）
- [ ] 现有训练计划生成无回归

---

## 7. 验证步骤

```powershell
pnpm --filter db seed
pnpm --filter db verify:seed
# 触发 PLAN_GENERATE_MEAL（Coach 或 ai/tasks）
# 查 plan detail UI 或 DB ingredients JSON
```

---

## 8. 不做

- Agent `enqueue_plan_generate` 改动（已能派发）
- 移动端食物库搜索 UI 大改（M4-07 范围）
- LLM 多轮纠错生成

---

## 9. 与 Agent Epic 关系

**独立 Issue**；不阻塞 AGENT-01~10。完成后饮食计划可追踪性提高，但与 Agent 工具无硬依赖。
