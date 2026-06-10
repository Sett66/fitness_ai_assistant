# M4 及之前 · 未完成工作清单

> **用途**：M4 收口、M3 遗留、文档与代码对齐。  
> **更新日期**：2026-06-04（M4 正式关闭：2026-06-04 验收通过）  
> **已完成主体**：M0–M3；M4 移动端 MVP；**Coach（ADR 0007）** 含 SSE 流式聊天。  
> **入口文档**：本文件 · [`HANDOFF-M4-AGENT.md`](./HANDOFF-M4-AGENT.md) · [`HANDOFF-M4.md`](./HANDOFF-M4.md) · 根 [`README.md`](../README.md)

---

## 0. 给接手 Agent 的系统提示（可复制）

```
你是接手 Fitness AI Assistant 的 Agent，任务是「M4 收口 + 遗留补齐」。

环境：Windows + PowerShell；pnpm monorepo；bare RN（禁止 Expo）；契约以 packages/shared Zod 为准。
必读：docs/HANDOFF-M4-REMAINING.md → docs/HANDOFF-M4-AGENT.md → docs/HANDOFF-M4.md → docs/adr/0007-coach-conversation-and-chat.md

硬性约束：
- 客户端禁止直连 LLM Key（ADR 0003）；Coach CHAT 走 POST .../messages/stream（SSE）
- 重任务（计划/识图）仍 Worker + 轮询或 Conversation 副作用
- 用户未明确要求不要 git commit；回复简体中文

本地启动：
pnpm install → shared/db build → docker compose up → migrate + seed
pnpm --filter api start:worker && pnpm --filter api start:api
pnpm --filter mobile start && pnpm --filter mobile android

验收：.\scripts\m4-acceptance.ps1（可选 m3-acceptance，需 Key）
```

---

## 1. 优先级说明

| 标记    | 含义                                       |
| ------- | ------------------------------------------ |
| **P0**  | 阻塞 M4 正式关闭或 PRD MVP P0              |
| **P1**  | 体验 / PRD P1                              |
| **P2**  | 质量 / 回归 / 可选                         |
| **DOC** | 文档同步（2026-06-04 已大批更新，见 §2.4） |
| **—**   | 已关闭 / 产品决定不做                      |

---

## 2. 已完成增量（2026-05 ~ 2026-06，文档曾未写）

| 能力                  | 说明                                                   |
| --------------------- | ------------------------------------------------------ |
| **Coach Tab**         | 多会话、流式 CHAT、Markdown 表格、倒置 `FlatList` 跟滚 |
| **ADR 0007**          | Conversation/Message、`COACH_CHAT`、日限               |
| **手动记餐**          | `ManualMealSheet`（Coach 附件菜单 + 营养页）           |
| **Onboarding 双计划** | `OnboardingPlanBootstrapScreen` 训练+饮食              |
| **饮食计划生成入口**  | `GenerateMealPlanSheet`（Coach / Plan 相关）           |
| **首页体重卡片**      | **产品取消**，不做（§2.1 M4-03）                       |

---

## 2.1 M4 未完成（移动端 MVP）

### P0 — PRD MVP 缺口

| #     | 工作项                       | 现状                                                         | 建议做法                                             |
| ----- | ---------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| M4-01 | **F4 饮食计划独立列表/详情** | ✅ 手测 + `m4-acceptance` 覆盖 `GET /plans?type=MEAL` 与详情 | —                                                    |
| M4-02 | **手动饮食录入**             | ✅ Coach + 营养 Tab `ManualMealSheet`                        | —                                                    |
| M4-03 | **F6 仪表盘「今日体重」**    | **— 产品决定不做**                                           | 体重仅在档案与 MET 消耗估算中使用；不做首页卡片/趋势 |
| M4-04 | **首登生成双计划**           | ✅ `OnboardingPlanBootstrapScreen` + 手测通过                | —                                                    |

### P1 — 体验与架构

| #     | 工作项                     | 现状                              | 建议做法                   |
| ----- | -------------------------- | --------------------------------- | -------------------------- |
| M4-05 | **离线打卡同步**           | MMKV 草稿有；无离线 mutation 队列 | pending session + 恢复重试 |
| M4-06 | **餐照结果手动修正**       | 识别结果页编辑有限                | 编辑 items 后再确认        |
| M4-07 | **食物库移动端（F7 P1）**  | 后端完整；移动端搜索未接          | 记餐时选食物算 kcal        |
| M4-08 | **训练消耗估算后端化**     | 客户端 MET 估算                   | M5 或 API 字段统一         |
| M4-09 | **真机 / 局域网 API 配置** | `env.ts` 硬编码模拟器地址         | `.env` / 构建注入          |

### P2 — 质量与验收

| #     | 工作项                      | 说明                                             |
| ----- | --------------------------- | ------------------------------------------------ |
| M4-10 | **M4 验收脚本加强**         | 扩展 meal-log、workout session、可选 MEAL_VISION |
| M4-11 | **移动端测试**              | feature 单测偏少                                 |
| M4-12 | **Dashboard 力量/有氧分类** | 仍用 title 启发式；待 schema                     |
| M4-13 | **Plan 饮食详情展示**       | 确认 `mealDays` UI 完整                          |

### 2.4 DOC — 文档同步（2026-06-04）

| #      | 文件                    | 状态                            |
| ------ | ----------------------- | ------------------------------- |
| DOC-01 | 根 `README.md`          | ✅ 已更新入口与进展             |
| DOC-02 | `HANDOFF-M4.md`         | ✅ 已更新 Roadmap / API / Coach |
| DOC-03 | `HANDOFF-M3.md`         | ✅ M4 状态已改                  |
| DOC-04 | `apps/api/README.md`    | ✅                              |
| DOC-05 | `packages/ui/README.md` | ✅                              |
| DOC-06 | `HANDOFF-M4-AGENT.md`   | ✅ 新增                         |

---

## 3. M3 及更早遗留

### 3.1 M3 验收 / 回归（P2）

| #     | 工作项                                | 说明                         |
| ----- | ------------------------------------- | ---------------------------- |
| M3-01 | `PLAN_GENERATE_MEAL` E2E              | 验收脚本偏 WORKOUT           |
| M3-02 | `m2-acceptance.ps1` 回归              | M3 后未系统回归              |
| M3-03 | LangGraph 措辞                        | 实现为单轮 JSON，见 ADR 0005 |
| M3-04 | `MESOCYCLE_REVIEW` / `REPORT_ANALYZE` | 归属 M6+                     |

### 3.2 基础设施（P2）

| #      | 工作项                                     |
| ------ | ------------------------------------------ |
| INF-01 | Prisma 软删除 `$extends` 未实装            |
| INF-02 | `refreshTokenHash` 占位                    |
| INF-03 | Cron 占位                                  |
| INF-04 | Swagger requestBody 表单                   |
| INF-05 | Seed：86 动作 + 10 食物（PRD 更大库为 P2） |
| INF-06 | `shared` i18n TODO                         |

### 3.3 历史修复（接手需知）

| 项                     | 说明                                             |
| ---------------------- | ------------------------------------------------ |
| 相册 `content://` 上传 | XHR + `{ uri }`                                  |
| 预签名 403             | API `clientPublicEndpoint` 签发，客户端勿改 host |
| Qwen 图片              | Worker `getObjectAsDataUrl`，改后需重启 Worker   |

---

## 4. M5 预览（勿混入 M4）

- GitHub Actions Android APK
- Sentry
- 真机联调 / `API_BASE_URL` 注入
- `WorkoutPlanDay.workoutCategory` migration

---

## 5. 建议实施顺序

1. M4-01 / M4-13：饮食计划展示收口
2. M4-10 + M3-01 ~ M3-02：验收与回归
3. M4-05 ~ M4-07：体验增强
4. M5 入口文档（待 M4 §6 勾选完成）

---

## 6. M4 关闭定义（Done 检查表）

- [x] PRD §3.1 P0 可演示（F4 饮食计划 UI + 生成；F6 体重卡片不做）
- [x] `.\scripts\m4-acceptance.ps1` 通过（需 API + Worker；COACH 需 DeepSeek 余额，可用 `-SkipCoachChat` 跳过）
- [x] 真机/模拟器：注册 → 档案 → Onboarding 双计划 → 打卡 → Coach 流式对话 → 餐照 → 仪表盘摄入（手测 2026-06-04）
- [ ] （建议）有 Key 时 `m3-acceptance.ps1` 或 MEAL_VISION + PLAN_GENERATE_MEAL 手测 — 归属 M5/回归，不阻塞 M4 关闭
- [x] 根 README + HANDOFF 与代码阶段一致
- [x] Roadmap 标 M4 ✅、入口切 M5（见根 README）

**M4 遗留（不阻塞关闭）**：§2.1 P1/P2（离线打卡、食物库扩容、M4-10 脚本持续加强等）→ M5 或按需补齐。

---

## 7. 关键文件索引

```
apps/mobile/src/features/coach/
apps/mobile/src/features/dashboard/
apps/mobile/src/api/endpoints/coach.ts
apps/api/src/modules/conversations/
apps/api/src/workers/ai-task.processor.ts
packages/ai-core/src/chains/coach-chat/
docs/adr/0007-coach-conversation-and-chat.md
scripts/m4-acceptance.ps1
```

---

_清单版本：v3 · M4 已关闭 · 2026-06-04_
