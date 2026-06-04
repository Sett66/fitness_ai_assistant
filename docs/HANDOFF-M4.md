# 交接文档 · M4 阶段（移动端 MVP / `apps/mobile`）

> **M3 已关闭；M4 移动端 MVP + Coach（ADR 0007）主体已实装。** 收口清单见 [`HANDOFF-M4-REMAINING.md`](./HANDOFF-M4-REMAINING.md)；增量见 [`HANDOFF-M4-AGENT.md`](./HANDOFF-M4-AGENT.md)。M3 见 [`HANDOFF-M3.md`](./HANDOFF-M3.md)。

---

## 0. 给下一位 Agent 的「系统提示」——请整段复制新开会话

```
你是接手 Fitness AI Assistant 项目的开发 Agent。M3 已完成，当前进入 M4（bare React Native 移动端）。

项目根目录（Windows + PowerShell）：用户本地路径以用户消息为准；仓库为 pnpm + Turborepo monorepo。

硬性约束（不要重新讨论）：
1. 用户环境：Windows、PowerShell；不要用 bash 式命令（mkdir -p、rm -rf、cp）；脚本优先 .ps1 或跨平台 npm 包。
2. 回复语言：简体中文；代码注释可用中文。
3. ARCHITECTURE / PRD / 已有 ADR（0001–0004）中的架构决策已锁定；RN 初始化、monorepo Metro 等若需新决策 → `docs/adr/0005+` 草稿再让用户确认。
4. **严禁 Expo**（任何 expo 包）；bare RN + Android 优先（见 HANDOFF-M2、apps/mobile/README）。
5. ADR 0003：AI 仍走 HTTP 投递 + Worker；移动端只轮询 `GET /v1/ai/tasks/:id`，禁止客户端直连 LLM Key。
6. 契约：API 形状以 `packages/shared` Zod 为准；移动端用 `z.infer`，禁止重复手写 DTO。
7. 包引用：workspace `@fitness/*`；UI 组件放 `packages/ui`（ARCH §3）。
8. Git：用户未明确要求时不要代执行 git commit；Conventional Commits（husky + commitlint）。

M4 目标（README Roadmap + ARCHITECTURE §3 apps/mobile）：
- 在 monorepo 内初始化 bare RN（先 ADR：metro/babel/watchFolders）。
- Auth（注册/登录/refresh）、档案、训练打卡+计时器、计划展示、餐照识别 UI、仪表盘。
- TanStack Query + Zustand + MMKV 离线草稿；401 自动 refresh（ARCH §7）。

必读顺序：
docs/HANDOFF-M4.md（本文件）
→ docs/HANDOFF-M3-AGENT.md（M3 实装与 API 约定）
→ docs/PRD.md（用户旅程 §4、F3/F4/F5）
→ docs/ARCHITECTURE.md（§3 mobile、§7 鉴权、§8）
→ apps/mobile/README.md
→ docs/HANDOFF-M2.md §3「明确不做」

M3 已就绪（勿重做）：ai-core、Worker 真实 LLM、Plan 落库、meal-logs、餐照二阶段建议、UserContext 注入。
本地 API：`pnpm --filter api start:worker` + `start:api`；`apps/api/.env` 加载见 `load-api-env.ts`。

开始做事前：pnpm install → shared/db build → Docker up → migrate + seed → 再 init RN。
```

---

## 1. Roadmap 进度

| 阶段   | 状态                  | 说明                                                                                         |
| ------ | --------------------- | -------------------------------------------------------------------------------------------- |
| M0–M2  | ✅                    | 见 [`HANDOFF-M2.md`](./HANDOFF-M2.md)                                                        |
| **M3** | **✅ 功能闭环**       | AI Worker + ai-core；见 §2 遗留项                                                            |
| **M4** | **✅ 主体 / ⬜ 收口** | `apps/mobile` MVP + Coach Tab；遗留见 [`HANDOFF-M4-REMAINING.md`](./HANDOFF-M4-REMAINING.md) |
| M5+    | ⬜                    | APK CI、Phase 2 等                                                                           |

---

## 2. M3 完成度（给 M4 的上下文）

### 2.1 已交付

| 能力               | 位置 / 说明                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `@fitness/ai-core` | `llm/*`、`chains/meal-vision`（VLM + DeepSeek 建议）、`graphs/plan-generator`（**单轮 JSON**，非 LangGraph 库）                     |
| Worker             | [`apps/api/src/workers/ai-task.processor.ts`](../apps/api/src/workers/ai-task.processor.ts) — `MEAL_VISION` / `PLAN_GENERATE_*`     |
| 用户上下文         | [`apps/api/src/domain/user-context.service.ts`](../apps/api/src/domain/user-context.service.ts) — Profile、力量、活跃计划、今日营养 |
| Plan 落库          | [`plan-persistence.service.ts`](../apps/api/src/domain/plan-persistence.service.ts) — `outputJson.planId`                           |
| 饮食日志           | `GET/POST /v1/meal-logs`、`GET /v1/meal-logs/daily-summary`                                                                         |
| 营养快照           | `packages/shared` — `NutritionDailySummarySchema`、`computeTargetDailyKcal`                                                         |
| 模型               | 默认 **`deepseek-v4-pro`** / `qwen-vl-max`（`LLM_MODELS`）；可选 env `DEEPSEEK_MODEL`                                               |
| 验收脚本           | [`scripts/m3-acceptance.ps1`](../scripts/m3-acceptance.ps1)                                                                         |

### 2.2 M3 遗留（不阻塞 M4）

| 项                                    | 说明                                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **LangGraph.js**                      | 文档/ README 仍写 LangGraph；实现为单次 `generateJson` + Zod。扩图或写 ADR 说明等价策略。                          |
| **LLM 解析重试**                      | 无自动 retry 节点；失败 → `FAILED` + BullMQ 重试。                                                                 |
| **MESOCYCLE_REVIEW / REPORT_ANALYZE** | 枚举存在，Processor 未实现。                                                                                       |
| **多轮对话**                          | ✅ ADR [`0007`](./adr/0007-coach-conversation-and-chat.md)：`Conversation` / `Message` + `COACH_CHAT` + SSE 流式。 |
| **ADR 0005**                          | ✅ [`0005-m3-ai-context-and-execution.md`](./adr/0005-m3-ai-context-and-execution.md)                              |
| **MEAL_VISION E2E**                   | 需 Qwen 能 **公网下载** 的图片 URL；本机 MinIO 仅 127.0.0.1 时需 `S3_PUBLIC_ENDPOINT` 或公网 `imageUrl`。          |
| **PLAN_GENERATE_MEAL**                | 代码路径已有，验收脚本仅强测 WORKOUT。                                                                             |
| **动作 seed**                         | 仅 5 个预设；计划里未匹配动作会跳过（日志 `跳过未知动作`）。                                                       |

### 2.3 M3 验收勾选（HANDOFF-M3 §6）

| 项                             | 状态                                                             |
| ------------------------------ | ---------------------------------------------------------------- |
| `@fitness/ai-core` build       | ✅                                                               |
| `MEAL_VISION` → DONE + schema  | ⚠️ 代码完成；E2E 依赖可访问图片                                  |
| `PLAN_GENERATE_WORKOUT` → DONE | ✅（已测 `planId` + days）                                       |
| `AiRun` token/cost/duration    | ✅                                                               |
| 无 Key 行为文档                | ✅ [`packages/ai-core/README.md`](../packages/ai-core/README.md) |
| 全仓 lint                      | ✅                                                               |
| ADR 0005                       | ❌ 建议 M4 前或并行补                                            |
| `m2-acceptance.ps1`            | 未回归（桩已替换，AI 行为变化）                                  |

---

## 3. M4 范围

### 3.1 必须做

对齐 [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) §3 `apps/mobile` 与 [`apps/mobile/README.md`](../apps/mobile/README.md)：

| 工作项    | 说明                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------- |
| RN 初始化 | `@react-native-community/cli`；**先 ADR** monorepo 下 metro `watchFolders` / `babel`               |
| 导航      | React Navigation（auth stack + main tabs）                                                         |
| API 层    | `ofetch` 或 fetch wrapper；Bearer + refresh；base URL 可配置（开发 `http://127.0.0.1:3000/v1`）    |
| Auth      | 注册/登录/refresh；Keychain 存 token                                                               |
| 档案      | 对接 `PUT/GET /v1/users/me/profile`、力量等级                                                      |
| 计划      | 投递 `POST /v1/ai/tasks`（`PLAN_GENERATE_WORKOUT`）；轮询结果；展示 `planId` / 训练日              |
| 打卡      | `WorkoutSession` / `WorkoutSet` HTTP（若 M2 未暴露需补 API，见 §4）                                |
| 营养      | 拍照 → `uploads/sign` → PUT MinIO → `MEAL_VISION` task → 展示 `items` + `advice` + `daily-summary` |
| 饮食日志  | `GET/POST /v1/meal-logs`                                                                           |
| 仪表盘    | 今日热量、训练完成度（**不含**首页「今日体重」独立卡片，见产品注）                                 |
| **Coach** | 多轮对话、SSE 流式 CHAT、计划/识图/记餐入口（ADR 0007）                                            |
| UI        | NativeWind + `packages/ui`；禁止 Expo                                                              |

### 3.2 明确不做（M4）

| 不做                            | 归属                                |
| ------------------------------- | ----------------------------------- |
| Expo                            | 禁止                                |
| 客户端直连 DeepSeek / DashScope | 禁止（ADR 0003）                    |
| **首页今日体重卡片**            | 产品决定不做；体重在档案 + 消耗估算 |
| Phase 2 社交/报告 UI            | M6（Social Tab 当前为占位）         |
| 商店上架 / 推送 SDK             | M5+                                 |
| 重写 ai-core / Worker           | 仅修 bug                            |

---

## 4. M4 可依赖的后端 API（已实现）

| 方法            | 路径                                                       | 用途                                                 |
| --------------- | ---------------------------------------------------------- | ---------------------------------------------------- |
| POST            | `/v1/auth/register` `login` `refresh`                      | Auth                                                 |
| PUT/GET         | `/v1/users/me/profile`                                     | 档案                                                 |
| POST/PATCH      | `/v1/users/me/strength-levels`                             | 力量                                                 |
| GET             | `/v1/exercises` `/v1/foods`                                | 库                                                   |
| POST            | `/v1/uploads/sign` `complete`                              | 餐照上传                                             |
| POST            | `/v1/ai/tasks`                                             | 投递 AI（body: `taskType`, `model`, `inputJson`）    |
| GET             | `/v1/ai/tasks/:id`                                         | 轮询；`result` 含计划或餐照 JSON                     |
| GET/POST/DELETE | `/v1/meal-logs`                                            | 饮食日志                                             |
| GET             | `/v1/meal-logs/daily-summary?date=&timezoneOffsetMinutes=` | 今日营养                                             |
| GET/POST        | `/v1/conversations` …                                      | 会话列表 / 创建                                      |
| GET             | `/v1/conversations/default`                                | 默认会话 + 最近 50 条消息                            |
| GET             | `/v1/conversations/:id/messages`                           | 分页历史                                             |
| POST            | `/v1/conversations/:id/messages`                           | 非流式消息（含 action → Worker 副作用）              |
| POST            | `/v1/conversations/:id/messages/stream`                    | **SSE**：`accepted` / `delta` / `done`（Coach CHAT） |
| GET             | `/v1/plans` …                                              | 计划列表 / 详情（移动端已用）                        |

### 4.1 后端补充说明

| 能力           | 现状                                                           |
| -------------- | -------------------------------------------------------------- |
| **训练打卡**   | `apps/api` plans 模块下 workout sessions HTTP 已暴露           |
| **Coach 流式** | HTTP SSE 同步拉流；流结束后 `inferSuggestedActions` 第二次 LLM |

---

## 5. AI 任务 mobile 集成备忘

### 5.1 训练计划

```json
POST /v1/ai/tasks
{
  "taskType": "PLAN_GENERATE_WORKOUT",
  "model": "deepseek-v4-pro",
  "inputJson": {
    "mesocycleWeeks": 4,
    "notes": "用户偏好说明",
    "timezoneOffsetMinutes": 480
  }
}
```

Worker 自动合并 Profile / 力量 / 今日营养。成功后 `result.planId` + `result.days[]`。

### 5.2 餐照识别

```json
{
  "taskType": "MEAL_VISION",
  "model": "qwen-vl-max",
  "inputJson": {
    "objectKey": "meal/{userId}/{uuid}",
    "mealType": "LUNCH",
    "saveMealLog": true,
    "timezoneOffsetMinutes": 480
  }
}
```

或公网 `imageUrl`。`result` 含 `items`、`nutritionContext`、`advice`（`summary` / `mealImpact` / `dinnerSuggestion`）、可选 `mealLogId`。

### 5.3 轮询

- 间隔 1–2s，超时 120–180s（计划生成较慢）
- `status`: `QUEUED` → `RUNNING` → `DONE` | `FAILED`（看 `errorMsg`）

---

## 6. 本地环境（PowerShell）

```powershell
docker compose -f docker/docker-compose.yml up -d
pnpm --filter @fitness/shared build
pnpm --filter @fitness/db build
pnpm --filter db migrate:deploy
pnpm --filter db seed

# 终端 1
pnpm --filter api start:worker
# 终端 2
pnpm --filter api start:api

# M3 回归（需 API Key）
.\scripts\m3-acceptance.ps1
```

`apps/api/.env`：`DEEPSEEK_API_KEY`、`DASHSCOPE_API_KEY`；`S3_ENDPOINT=http://127.0.0.1:9000`；Android 模拟器访问 API 时 base URL 可能需 `10.0.2.2:3000`（真机用局域网 IP）。

---

## 7. 用户本机坑位（继承 M2/M3）

| 现象                                          | 处理                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| AI 一直 QUEUED                                | 未开 worker 或 Redis 不通                                                     |
| DeepSeek `deepseek-v3.2` 报错                 | 改用 `deepseek-v4-pro`                                                        |
| 餐照 FAILED「download multimodal」            | 图片 URL 必须公网可达；或配置 `S3_PUBLIC_ENDPOINT`                            |
| Swagger 无 body 表单                          | 用脚本 / curl / 移动端直连                                                    |
| `pnpm --filter @fitness/shared build` 空 dist | 删 `packages/shared/tsconfig.build.tsbuildinfo` 后重编（已加 build 脚本清理） |

---

## 7.1 Dashboard 后续（首页 UI）

首页 [`WeekActivityStrip`](apps/mobile/src/features/dashboard/components/WeekActivityStrip.tsx) 本周训练色块当前用 **计划日 title 启发式** 区分力量 / 有氧（如 title 含「有氧、跑步、HIIT」→ 有氧色）。

**待补 schema（Phase 2 或 M5）**：

- `WorkoutPlanDay.workoutCategory`: `STRENGTH | CARDIO`（可选同步到 `WorkoutSession`）
- 落地后删除 `week-activity.ts` 中的 title 正则，改为读库字段

---

## 8. 建议 M4 实施顺序

1. ADR：monorepo 内 RN init（metro、pnpm hoisting）。
2. 初始化 `apps/mobile` android 工程 + 最小 App 启动。
3. `@fitness/shared` 类型 + API client + auth 流。
4. 档案页 → 仪表盘（daily-summary）。
5. 餐照：uploads + ai/tasks 轮询 + 结果页。
6. 计划：投递 + 轮询 + 列表（必要时后端加 `GET /plans`）。
7. 打卡（若补 workout HTTP）+ 计时器。
8. `packages/ui` 抽公共组件。

---

## 9. 推荐 Skills（M4 会话）

| 场景            | Skill                                        |
| --------------- | -------------------------------------------- |
| M4 实现         | 本文件 + ARCHITECTURE + `apps/mobile/README` |
| RN init / Metro | 新 ADR + `grill-with-docs`                   |
| UI 探索         | `prototype`                                  |
| 联调失败        | `diagnose`                                   |

---

## 10. Git

- M3 代码可能大量未提交；勿提交 `.env`。
- 用户未明确要求前不要代 `git commit`。

---

## 11. 关键文件索引

```
apps/mobile/src/features/coach/   # Coach Tab、流式聊天、Markdown
apps/mobile/src/app/navigation/  # 五 Tab（含 Social 占位）
packages/ui/
apps/api/src/modules/conversations/
apps/api/src/modules/meal-logs/
apps/api/src/modules/plans/
apps/api/src/workers/ai-task.processor.ts
packages/ai-core/src/chains/coach-chat/
docs/adr/0007-coach-conversation-and-chat.md
scripts/m3-acceptance.ps1
scripts/m4-acceptance.ps1
docs/HANDOFF-M4-REMAINING.md
docs/HANDOFF-M4-AGENT.md
```

---

_文档版本：v2 · 2026-06-04 · M4 主体完成，收口见 REMAINING_

### 修订记录

| 日期       | 说明                                                 |
| ---------- | ---------------------------------------------------- |
| 2026-05-19 | 自 M3 功能闭环交接至 M4 mobile                       |
| 2026-06-04 | M4 MVP + Coach；文档与 README 同步；体重卡片明确不做 |
