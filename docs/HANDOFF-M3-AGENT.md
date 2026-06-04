# M3 会话交接 · 给下一位 Agent（M3 已关闭）

> 本文档记录 **M3 实现增量**（相对 [`HANDOFF-M3.md`](./HANDOFF-M3.md) 原文）。M4 入口见 [`HANDOFF-M4.md`](./HANDOFF-M4.md)。

---

## 1. 本会话完成的工作

### 1.1 原 M3 清单

- `packages/ai-core`：DeepSeek + Qwen-VL 客户端、`meal-vision`、`plan-generator`（单轮 JSON，**未引入 @langchain/langgraph**）。
- `apps/api` Worker 替换桩，写入 `AiRun` 计量字段。
- `apps/api` 依赖 `@fitness/ai-core`。

### 1.2 超出 HANDOFF-M3 原文（产品向）

| 增量                 | 说明                                                               |
| -------------------- | ------------------------------------------------------------------ |
| **UserContext 注入** | 计划任务自动带 Profile、力量、活跃计划摘要、今日营养               |
| **Plan 落库**        | `Plan` / `WorkoutPlanDay` / `MealPlanDay`；`result.planId`         |
| **餐照二阶段**       | VLM 识图 + DeepSeek `advice`（今日摄入、晚餐建议）                 |
| **meal-logs 模块**   | CRUD + `daily-summary`                                             |
| **TDEE 工具**        | `packages/shared/src/utils/nutrition-tdee.ts`                      |
| **模型 V4**          | `deepseek-v4-pro`（v3.2 账号已不可用）                             |
| **objectKey**        | MEAL_VISION 支持 MinIO 预签名 GET（`S3StorageService.presignGet`） |

---

## 2. 实测结果

| 测试                                   | 结果                                                           |
| -------------------------------------- | -------------------------------------------------------------- |
| `pnpm --filter @fitness/ai-core build` | ✅                                                             |
| `pnpm lint`                            | ✅                                                             |
| `PLAN_GENERATE_WORKOUT` E2E            | ✅（`m3-acceptance.ps1`，~98s，`planId` + `days`）             |
| `MEAL_VISION` E2E                      | ⚠️ 依赖公网图 URL；`seg_food.jpg` / MinIO 公网可达性需本机验证 |
| DeepSeek 余额                          | 用户已充值；需用 **v4** 模型名                                 |

---

## 3. 已知问题

1. **动作匹配**：seed 仅 5 条，LLM 生成的动作名大量 `PlanPersistenceService` 跳过。
2. **README 表述**：Roadmap 写「LangGraph」，代码为单节点 LLM。
3. **shared build**：若 `dist` 为空，删 `tsconfig.build.tsbuildinfo`（已在 `package.json` build 脚本处理）。
4. **`.env.example`**：勿提交真实 API Key（若曾被填入请轮换）。

---

## 4. 未做（明确留给后续）

- LangGraph 多节点（评估→训练→饮食→retry）
- `memory/` 会话持久化目录
- `MESOCYCLE_REVIEW` / `REPORT_ANALYZE` Worker 分支
- 多轮对话表 + 会话 API（用户曾提，划为 M3+）
- ~~`docs/adr/0005`~~ → 已写 [`0005-m3-ai-context-and-execution.md`](./adr/0005-m3-ai-context-and-execution.md)
- `GET /v1/plans/:id`（移动端可能需要）

---

## 5. 关键命令

```powershell
pnpm --filter @fitness/shared build
pnpm --filter @fitness/ai-core build
pnpm --filter api build
pnpm --filter api start:worker
pnpm --filter api start:api
.\scripts\m3-acceptance.ps1
```

---

_2026-05-19 · M3 关闭_
