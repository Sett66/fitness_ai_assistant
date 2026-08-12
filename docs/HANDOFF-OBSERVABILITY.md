# Coach 聊天观测（Langfuse）· Phase 1 验收与接手

> **用途**：Langfuse 观测 Epic Phase 1 入口；自动化验收 + 手测清单 + 故障排查。  
> **更新日期**：2026-08-12  
> **架构依据**：[`docs/adr/0010-coach-chat-observability-langfuse.md`](./adr/0010-coach-chat-observability-langfuse.md)  
> **Issue 索引**：[`docs/issues/observability/README.md`](./issues/observability/README.md)

---

## 0. 阶段目标

| 轨道              | 内容                                               | 状态         |
| ----------------- | -------------------------------------------------- | ------------ |
| **Phase 1 trace** | Langfuse SDK + 非 Agent / Agent 全链路 generation  | ✅ OBS-01/02 |
| **验收与指针**    | 验收脚本、`AiRun.outputJson.observability`、本文档 | ✅ OBS-03    |
| **Phase 2**       | Langfuse Prompt Management（工具描述版本化）       | ⬜ OBS-04    |

**Phase 1 闭环**：一轮 `COACH_CHAT` 可在 Langfuse UI 看到 trace 时间线；DB 侧 `AiRun.outputJson.observability.traceId` 可跳转 UI 调试。

---

## 1. 环境变量

在 `apps/api/.env`（或进程环境）配置：

| 变量                           | 必需      | 说明                                                      |
| ------------------------------ | --------- | --------------------------------------------------------- |
| `LANGFUSE_ENABLED`             | 否        | 默认 `false`；`true` 时上报 trace                         |
| `LANGFUSE_PUBLIC_KEY`          | 启用时    | Langfuse 项目公钥                                         |
| `LANGFUSE_SECRET_KEY`          | 启用时    | Langfuse 项目私钥                                         |
| `LANGFUSE_BASE_URL`            | 否        | 默认 `https://cloud.langfuse.com`；本地自托管见 §2        |
| `LANGFUSE_SAMPLE_RATE`         | 否        | 采样率，默认 `1`                                          |
| `LANGFUSE_TRACING_ENVIRONMENT` | 否        | trace 环境标签，默认 `development`                        |
| `COACH_AGENT_ENABLED`          | 路径相关  | `true` = Agent ReAct；`false` = 经典 `runCoachChatStream` |
| `DEEPSEEK_API_KEY`             | 手测/验收 | Coach 对话 LLM                                            |
| `AMAP_WEB_KEY`                 | Agent Geo | 天气 / POI；无 Key 时脚本加 `-SkipGeoTools`               |
| `DATABASE_URL` / `REDIS_URL`   | 必需      | Postgres + BullMQ Worker                                  |

**注意**：

- Langfuse Key **仅**存在于 `apps/api` 环境变量，移动端不得打包。
- 修改 `LANGFUSE_ENABLED` 或 `COACH_AGENT_ENABLED` 后须**重启 API 进程**。
- `LANGFUSE_ENABLED=false`（默认）时 COACH_CHAT 行为与现网完全一致，不上报 trace。

---

## 2. 启动顺序

### 2.1 推荐：全栈 dev stack（含本地 Langfuse）

```powershell
pnpm install
pnpm dev:stack
```

- API：`http://127.0.0.1:3000`
- Langfuse UI：`http://127.0.0.1:3100`
- 首次 Key 见 `apps/api/.env.example`（`pk-lf-fitness-local` / `sk-lf-fitness-local`）

### 2.2 分步启动

```powershell
pnpm install
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/langfuse.compose.yml up -d   # 可选，本地 Langfuse
pnpm --filter api exec prisma migrate deploy

# 终端 1
pnpm --filter api start:worker

# 终端 2（apps/api/.env 已设 Key + LANGFUSE_ENABLED=true）
pnpm --filter api start:api
```

### 2.3 Langfuse Cloud（替代本地自托管）

1. 在 [Langfuse Cloud](https://cloud.langfuse.com) 创建项目（Hobby 计划）。
2. 配置 `LANGFUSE_PUBLIC_KEY`、`LANGFUSE_SECRET_KEY`、`LANGFUSE_ENABLED=true`。
3. `LANGFUSE_BASE_URL` 留空或设为 `https://cloud.langfuse.com`。

---

## 3. 自动化验收脚本

```powershell
# 非 Agent 路径（COACH_AGENT_ENABLED=false，重启 API）
.\scripts\observability-acceptance.ps1

# 启用 Langfuse 时断言 observability.traceId
$env:LANGFUSE_ENABLED = 'true'
.\scripts\observability-acceptance.ps1 -RequireLangfuse

# Agent 路径（COACH_AGENT_ENABLED=true，重启 API）
.\scripts\observability-acceptance.ps1 -RequireLangfuse

# 无 DeepSeek 余额
.\scripts\observability-acceptance.ps1 -SkipCoachChat

# 无高德 Key（Agent 路径）
.\scripts\observability-acceptance.ps1 -SkipGeoTools
```

| 参数               | 说明                                                     |
| ------------------ | -------------------------------------------------------- |
| `-SkipCoachChat`   | 跳过 SSE 对话（无 DeepSeek 余额）                        |
| `-RequireLangfuse` | `$env:LANGFUSE_ENABLED` 非 `true` 则失败；断言 `traceId` |
| `-SkipAgentPath`   | 只测非 Agent（须 `COACH_AGENT_ENABLED=false`）           |
| `-SkipGeoTools`    | Agent 路径跳过 Geo 工具断言                              |

**脚本流程**：

1. Auth → `GET /v1/health` + `GET /v1`（读取 API **运行时** `langfuseEnabled` / `coachAgentEnabled`）→ 打印 `apps/api/.env` 文件提示
2. **非 Agent**（API `coachAgentEnabled=false`）：SSE `CHAT` → `GET /ai/tasks/:aiRunId` → 断言 `result.observability.traceId`（`-RequireLangfuse` 时）
3. **Agent**（`COACH_AGENT_ENABLED=true`）：带 `locationContext` 的天气消息 → 断言 `toolTrace` 含 `get_weather`（或回复含天气词）→ `toolSpanCount >= 1`（若写入）

**AiRun 指针**：成功且 Langfuse 启用时，`GET /v1/ai/tasks/:id` 的 `result` 含：

```json
{
  "reply": "...",
  "observability": {
    "traceId": "<同 aiRunId>",
    "traceUrl": "http://127.0.0.1:3100/trace/<id>",
    "generationCount": 2,
    "toolSpanCount": 1
  }
}
```

---

## 4. 手测清单

### 4.1 非 Agent 一轮（`COACH_AGENT_ENABLED=false`）

1. 设 `LANGFUSE_ENABLED=true`，重启 API。
2. 移动端或 curl 发 Coach 流式消息（普通健身问题）。
3. Langfuse UI → Traces → 按 `sessionId`（= conversationId）或 trace id（= aiRunId）找到记录。
4. 期望：根 trace `COACH_CHAT`、至少 1 个 generation（`streamText` + 可选 `generateJson`）。

### 4.2 Agent 天气一轮（`COACH_AGENT_ENABLED=true`）

1. 授予定位或附 `locationContext`，问「今天适合户外跑吗」。
2. Langfuse UI 期望：agent 子节点、tool span（`get_weather`）、最终 stream generation。
3. DB：`AiRun.outputJson.toolTrace` 仍有摘要（ADR 0008 策略不变）。

### 4.3 Flag 关闭回归（`LANGFUSE_ENABLED=false`）

1. 关闭 Langfuse，重启 API。
2. `.\scripts\observability-acceptance.ps1`（不加 `-RequireLangfuse`）应 exit 0。
3. `GET /ai/tasks/:id` 的 `result` **无** `observability` 字段。
4. Coach 对话功能与延迟与观测开启前一致。

### 4.4 Langfuse UI 人工确认（脚本无法替代）

1. 打开 `LANGFUSE_BASE_URL`（本地 `http://127.0.0.1:3100` 或 Cloud 项目 URL）。
2. 从 `AiRun.outputJson.observability.traceUrl` 深链进入，或搜索 trace id。
3. 核对：input 为用户消息、generations 分段、Agent 路径下 tool span 输入/输出。

---

## 5. 故障排查

| 现象                         | 可能原因                           | 处理                                                                        |
| ---------------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| 脚本 `-RequireLangfuse` 失败 | API 未读 `LANGFUSE_ENABLED=true`   | 改 `.env` 后**重启 API**；脚本 `$env:` 仅用于预检提示                       |
| `observability` 为空         | Key 缺失或采样未命中               | 查 API 日志 `LANGFUSE_ENABLED=true 但未配置 KEY`；查 `LANGFUSE_SAMPLE_RATE` |
| Langfuse UI 无 trace         | 异步 flush 延迟 / 跨境网络         | 等 30–60s 刷新；本地自托管优先排查                                          |
| trace 为空或缺 generation    | DeepSeek 调用失败                  | 查 `AiRun.status=FAILED`；确认 DeepSeek 余额                                |
| Agent 无 tool span           | `AMAP_WEB_KEY` 缺失或 Agent 未启用 | 设 Key 或 `-SkipGeoTools`；确认 `COACH_AGENT_ENABLED=true`                  |
| 上报失败但用户回复正常       | 设计如此（异步、不阻塞 SSE）       | 查 API warn 日志 `Langfuse flush 失败`                                      |

---

## 6. Phase 2 指针

Phase 2（Langfuse Prompt Management）见 [`docs/issues/observability/OBS-04.md`](./issues/observability/OBS-04.md)：

- **触发**：Phase 1 稳定 ≥1 周，或积累 ≥5 个可复现错工具/幻觉 case（均有 `aiRunId`）。
- **范围**：`COACH_AGENT_TOOL_DEFINITIONS` description → Langfuse Prompt；Zod / `CoachToolName` 仍留 `packages/shared`。
- **前置**：本 Phase 1 trace 基线 + 本文档验收通过。

---

## 7. 关键文件索引

```
scripts/observability-acceptance.ps1
scripts/m5-agent-acceptance.ps1          # Agent 功能验收（不含 Langfuse 断言）
apps/api/src/infra/observability/        # Langfuse trace / tool span
apps/api/src/modules/conversations/conversations.service.ts
packages/shared/src/schemas/conversation.ts   # CoachChatObservabilitySchema
docs/adr/0010-coach-chat-observability-langfuse.md
docker/langfuse.compose.yml
scripts/dev-stack.mjs
```

---

## 8. Phase 1 关闭检查表

- [ ] `apps/api/.env`：`LANGFUSE_ENABLED=true` + Key 已配置（本地或 Cloud）
- [ ] API + Worker 已启动
- [ ] 非 Agent：`COACH_AGENT_ENABLED=false` → `.\scripts\observability-acceptance.ps1 -RequireLangfuse` exit 0
- [ ] Agent：`COACH_AGENT_ENABLED=true` → 同上 exit 0（或 `-SkipGeoTools` 若无常驻 Key）
- [ ] `LANGFUSE_ENABLED=false` → `.\scripts\observability-acceptance.ps1` exit 0（无 observability 断言）
- [ ] Langfuse UI 手测 §4.4 至少确认 1 条 trace
- [ ] `pnpm lint && pnpm typecheck` 通过
- [ ] [`OBS-01`～`OBS-03`](./issues/observability/README.md) Acceptance criteria 已勾选

**Epic Phase 1 Done**：上表全部勾选 → Coach 观测 Phase 1 正式关闭。
