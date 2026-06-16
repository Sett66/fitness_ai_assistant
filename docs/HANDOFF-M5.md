# M5 · Coach Agent Epic 验收与接手

> **用途**：M5 阶段入口；Coach 真 Agent Epic（ADR 0008）自动化验收 + 手测清单。  
> **更新日期**：2026-06-16  
> **前置**：M4 已关闭（[`HANDOFF-M4-REMAINING.md`](./HANDOFF-M4-REMAINING.md) §6）  
> **Issue 索引**：[`docs/issues/agent/README.md`](./issues/agent/README.md) · [`AGENT-ISSUES.md`](./AGENT-ISSUES.md)

---

## 0. 阶段目标

| 轨道           | 内容                                        | 状态                             |
| -------------- | ------------------------------------------- | -------------------------------- |
| **Agent Epic** | LangGraph ReAct + Geo 工具 + 记忆 + enqueue | 实施完成，待本文件验收勾选       |
| **M5 工程**    | APK CI、Sentry、真机 `API_BASE_URL`         | 进行中（不阻塞 Agent Epic 关闭） |

M5 = **移动端工程化** + **Agent MVP 可重复验收**。

---

## 1. 环境变量

在 `apps/api/.env`（或进程环境）配置：

| 变量                  | Agent 手测 | 说明                                                        |
| --------------------- | ---------- | ----------------------------------------------------------- |
| `COACH_AGENT_ENABLED` | **必需**   | `true` 启用 Agent SSE 路径；`false` 回退经典 `runCoachChat` |
| `DEEPSEEK_API_KEY`    | **必需**   | Coach 对话 LLM                                              |
| `AMAP_WEB_KEY`        | Geo 手测   | 天气 / 逆地理 / POI；无 Key 时脚本加 `-SkipGeoTools`        |
| `DATABASE_URL`        | 必需       | Postgres                                                    |
| `REDIS_URL`           | 必需       | BullMQ Worker                                               |

**注意**：修改 `COACH_AGENT_ENABLED` 后须**重启 API 进程**；Worker 仍须运行（enqueue 计划/识图、记忆抽取等）。

---

## 2. 启动顺序

```powershell
pnpm install
pnpm --filter @fitness/shared build
pnpm --filter @fitness/db build
docker compose -f docker/docker-compose.yml up -d
pnpm --filter api exec prisma migrate deploy
pnpm --filter api exec prisma db seed   # 可选 demo 账号

# 终端 1
pnpm --filter api start:worker

# 终端 2（apps/api/.env 已设 Key + COACH_AGENT_ENABLED）
pnpm --filter api start:api

# 终端 3（手测移动端，可选）
pnpm --filter mobile start
pnpm --filter mobile android
```

---

## 3. 自动化验收脚本

### 3.1 Agent 路径（M5）

```powershell
$env:COACH_AGENT_ENABLED = 'true'
pnpm --filter api start:worker
pnpm --filter api start:api
.\scripts\m5-agent-acceptance.ps1
```

| 参数             | 说明                                             |
| ---------------- | ------------------------------------------------ |
| `-SkipCoachChat` | 无 DeepSeek 余额时跳过 SSE 对话                  |
| `-SkipGeoTools`  | 无 `AMAP_WEB_KEY` 时跳过 Geo 工具断言            |
| `-RequireAgent`  | 本地 `$env:COACH_AGENT_ENABLED` 非 `true` 则失败 |

**实现说明**：

- Agent **toolTrace 仅出现在 SSE 路径**（`POST /v1/conversations/:id/messages/stream`）。
- `POST .../messages`（Worker `COACH_CHAT`）在 Agent 开启时**仍走经典 LLM**，不含 toolTrace；移动端生产路径为 SSE，与脚本一致。
- 脚本解析 SSE `done` 事件的 `toolTrace`；失败时检查 API `.env`、DeepSeek 余额、高德 Key。

### 3.2 回退路径（M4）

```powershell
$env:COACH_AGENT_ENABLED = 'false'
# 重启 API
.\scripts\m4-acceptance.ps1
# 无 DeepSeek 余额: .\scripts\m4-acceptance.ps1 -SkipCoachChat
```

`COACH_AGENT_ENABLED=false` 时 **m4 必须 exit 0**（Epic 回退保证）。

### 3.3 CI 单测（Geo mock）

无需 Key 的回归：

```powershell
pnpm --filter api test
```

含 `apps/api/src/infra/geo/amap.client.spec.ts`（AGENT-03 mock）。CI 工作流 `.github/workflows/ci.yml` 已跑全仓 `pnpm test`。

---

## 4. 手测用例（与 AGENT-07/08 一致）

在模拟器/真机 Coach Tab，`COACH_AGENT_ENABLED=true`：

1. **天气 + GPS**  
   授予定位（或静默 PUT 位置成功后），问「今天适合户外跑步吗」。  
   期望：回复含气温/降水/风至少一项；可选见「正在查询天气…」。

2. **出差健身房**  
   问「我下周去上海市出差，附近有什么健身房」。  
   期望：回复含 ≥1 馆名或地址（需 `AMAP_WEB_KEY`）。

3. **Agent enqueue 饮食计划**  
   对话：「帮我生成 4 周饮食计划」。  
   期望：与按钮相同 pending → Worker `PLAN_GENERATE_MEAL` → `PLAN_CARD` 消息。

额外回归：`COACH_AGENT_ENABLED=false` 时 Coach 流式对话、计划按钮、餐照识图仍可用。

---

## 5. Coach Agent Epic 关闭检查表

- [ ] `apps/api/.env`：`COACH_AGENT_ENABLED=true` + DeepSeek +（Geo 手测）`AMAP_WEB_KEY`
- [ ] Worker + API 已启动
- [ ] `.\scripts\m5-agent-acceptance.ps1` exit 0（或 `-SkipCoachChat` / `-SkipGeoTools` 文档化跳过）
- [ ] `COACH_AGENT_ENABLED=false` 重启 API 后 `.\scripts\m4-acceptance.ps1` exit 0
- [ ] 手测 §4 三条通过（或记录已知环境限制）
- [ ] `pnpm --filter api test` 通过（含 geo mock）
- [ ] [`docs/issues/agent/AGENT-01`～`AGENT-10`](./issues/agent/README.md) Acceptance criteria 已勾选
- [ ] 全部 AGENT PR 已合并 `main`

**Epic Done 定义**：上表全部勾选 + `m5-agent-acceptance.ps1` 在 Key 齐全环境 exit 0。

**不阻塞 Epic**：`MEAL-QUALITY-01`（饮食计划内容加厚）独立轨道。

---

## 6. 关键文件索引

```
scripts/m5-agent-acceptance.ps1
scripts/m4-acceptance.ps1
apps/api/src/modules/conversations/conversations.service.ts   # SSE Agent 路径
apps/api/src/domain/agent/tool-registry.service.ts
apps/api/src/config/agent-config.service.ts
packages/ai-core/src/graphs/coach-agent/
docs/adr/0008-coach-agent-tools-and-memory.md
docs/issues/agent/AGENT-10.md
```

---

## 7. M5 后续（非 Agent Epic）

- GitHub Actions Android APK 构建
- Sentry 接入
- 真机 `API_BASE_URL` / `.env` 注入（M4-09）
- 可选：CI 跑 `m5-agent-acceptance.ps1`（需 Key secret，见 AGENT-10 §8）

---

_清单版本：v1 · AGENT-10 交付 · 2026-06-16_
