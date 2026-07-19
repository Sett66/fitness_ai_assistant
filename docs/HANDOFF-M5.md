# M5 · Coach Agent Epic 验收与接手

> **用途**：M5 阶段入口；Coach 真 Agent Epic（ADR 0008）自动化验收 + 手测清单。  
> **更新日期**：2026-07-19  
> **前置**：M4 已关闭（[`HANDOFF-M4-REMAINING.md`](./HANDOFF-M4-REMAINING.md) §6）  
> **Issue 索引**：[`docs/issues/agent/README.md`](./issues/agent/README.md) · [`AGENT-ISSUES.md`](./AGENT-ISSUES.md)

---

## 0. 阶段目标

| 轨道           | 内容                                        | 状态                                                             |
| -------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| **Agent Epic** | LangGraph ReAct + Geo 工具 + 记忆 + enqueue | ✅ **已关闭** · 2026-07-19（脚本 + 真机手测）                    |
| **M5 工程**    | 精简关闭 = E1 配置注入                      | ✅ **已关闭** · 2026-07-19（E2 APK CI / E3 Sentry **刻意不做**） |

**本机验收（2026-07-19）**：`m5` 5/5；`m4` 回退全绿；`api test` 全绿；真机可定位查天气/周边健身房（含时间工具）。

**M5 精简关闭**：Agent Epic + E1（`apps/mobile/.env` 注入 API/存储地址）。完整关闭项见 §7.2，本期不做。

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

- [x] `apps/api/.env`：`COACH_AGENT_ENABLED=true` + DeepSeek +（Geo 手测）`AMAP_WEB_KEY`（m5 天气/健身房断言通过，说明 Key 可用）
- [x] Worker + API 已启动
- [x] `.\scripts\m5-agent-acceptance.ps1` exit 0 · 2026-07-19 · **5 passed, 0 failed**
- [x] `COACH_AGENT_ENABLED=false` 重启 API 后 `.\scripts\m4-acceptance.ps1` exit 0 · 2026-07-19 · 含 `COACH_CHAT DONE`
- [x] 手测 §4：真机定位 + 天气 + 周边健身房通过（2026-07-19；enqueue 饮食计划以 m5/日常路径为准）
- [x] `pnpm --filter api test` 通过（含 geo mock）· 2026-07-19
- [x] [`docs/issues/agent/AGENT-01`～`AGENT-10`](./issues/agent/README.md) Acceptance criteria 已勾选
- [x] 全部 AGENT PR 已合并 `main`（以当前主干交付为准）

**Epic Done**：上表全部勾选 → **Coach Agent Epic 正式关闭（2026-07-19）**。

**不阻塞 Epic**：`MEAL-QUALITY-01`、§7 M5 工程轨。

**验收后建议**：日常开发把 `COACH_AGENT_ENABLED` 改回 `true` 并重启 API。

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

## 7. M5 工程轨 · 怎么关闭

> Agent Epic **已关**。整阶段 Roadmap 标 **M5 ✅** 需要本节约定完成。  
> 个人 demo 可用 **精简关闭**；完整关闭对齐 ARCHITECTURE 预留的 `android.yml` + Sentry。

### 7.1 关闭策略（二选一）

| 策略                 | 必须做完     | 可砍 / 延后                    | 适用                                    |
| -------------------- | ------------ | ------------------------------ | --------------------------------------- |
| **精简关闭（推荐）** | E1 配置注入  | E2 APK CI、E3 Sentry、CI 跑 m5 | 练手 demo、真机已能联调                 |
| **完整关闭**         | E1 + E2 + E3 | CI 跑 m5（仍可选）             | 想对齐架构草案「可重复出 APK + 可观测」 |

### 7.2 工程项与完成定义（DoD）

#### E1 · 真机 `API_BASE_URL` 注入（原 M4-09）— ✅ 已完成（精简关闭）

**实现（2026-07-19）**：

| 文件                                                  | 作用                                                  |
| ----------------------------------------------------- | ----------------------------------------------------- |
| `apps/mobile/.env.example`                            | 模板（可入库）                                        |
| `apps/mobile/.env`                                    | 本地真机 IP（gitignore，勿提交）                      |
| `apps/mobile/load-env.js`                             | Metro/Babel 启动时加载 `.env` → `process.env`         |
| `babel-plugin-transform-inline-environment-variables` | 打包时内联 `API_BASE_URL` / `STORAGE_PUBLIC_ENDPOINT` |
| `src/dev-config.ts` + `src/env.ts`                    | 有 env 用 env，否则模拟器默认 `10.0.2.2`              |

**使用**：见 [`apps/mobile/README.md`](../apps/mobile/README.md)「真机联调」。改 `.env` 后须**重启 Metro**。

**DoD**：✅ 换 IP 不改业务代码；仓库无硬编码局域网 IP；说明已写清。

#### E2 · GitHub Actions 打 APK — **完整关闭必做**

**做法**：新增 `.github/workflows/android.yml`（ARCHITECTURE 已预留）：

- 触发：`workflow_dispatch` 和/或 `tag v*`
- `runs-on: ubuntu-latest` + Android SDK
- `pnpm install` → `pnpm --filter mobile android` 的 release/debug assemble
- `actions/upload-artifact` 上传 APK

**DoD**：Actions 跑绿并能下载安装包；本机也可 `cd apps/mobile/android && ./gradlew assembleDebug` 出包。

#### E3 · Sentry — **完整关闭必做**

**做法**：

1. 建 Sentry 免费项目，DSN 只放本地 / CI secret
2. RN：`@sentry/react-native` 初始化（`App.tsx`），开发环境可 `enabled: !__DEV__` 或采样降低
3. （可选）NestJS `@sentry/node` 接 API 未捕获异常
4. README 说明「可选；无 DSN 时 no-op」

**DoD**：真机/模拟器故意抛错后，Sentry 控制台能看到事件（或文档写明「未配置 DSN 则跳过」且代码不崩）。

#### 可选 · CI 跑 `m5-agent-acceptance.ps1`

需 Postgres/Redis + DeepSeek/高德 secrets，成本高；**不作为 M5 关闭条件**。本地脚本验收已足够。

### 7.3 M5 阶段关闭检查表

- [x] Agent Epic §5 全部勾选（2026-07-19）
- [x] **E1** 真机 API 配置注入落地（精简关闭）· 2026-07-19
- [ ] **E2** `android.yml` 可产出 APK — **刻意不做**（完整关闭才需要）
- [ ] **E3** Sentry 可开关接入 — **刻意不做**（完整关闭才需要）
- [x] 根 README Roadmap：**M5 ✅（精简关闭）**；下一阶段见 README

**精简关闭 Done（已达成）**：E1 + README 标 M5 ✅；E2/E3 明确不做。  
**完整关闭**（可选后续）：补齐 E2+E3 后再改文档表述即可。

### 7.4 不阻塞 / 已拆出

| 项                        | 说明                   |
| ------------------------- | ---------------------- |
| MEAL-QUALITY-01           | 并行轨道，饮食计划加厚 |
| E2 APK CI / E3 Sentry     | 完整关闭项，本期不做   |
| 离线打卡队列等 M4 P1 遗留 | 按需另开               |

---

_清单版本：v1.4 · M5 精简关闭 2026-07-19_
