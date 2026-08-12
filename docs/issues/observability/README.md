# Coach 聊天观测（Langfuse）· 分切片实施文档

> **Epic**：`COACH_CHAT` 可观测与调试 — Langfuse Cloud + `OpenAiCompatibleJsonClient` 包装层  
> **架构依据**：[ADR 0010](../../adr/0010-coach-chat-observability-langfuse.md)  
> **前提**：M5 Agent Epic 已关闭；`COACH_AGENT_ENABLED` 可 true/false  
> **状态（2026-08-12）**：OBS-01、OBS-02、OBS-03 已完成；OBS-04 待实施

## 给接手 Agent 的通用说明

复制下面整段到新会话开头，再附上你所负责切片的文档全文。

```
你是 Fitness AI Assistant monorepo 的实施 Agent，负责 docs/issues/observability/OBS-XX.md 所描述的单一切片。

环境：Windows + PowerShell；pnpm monorepo；bare React Native（禁止 Expo）。
契约：packages/shared 的 Zod 为唯一端到端真相；重大架构变更需 ADR。
硬性约束：
- Langfuse Key 仅 apps/api 环境变量；移动端不得打包
- LANGFUSE_ENABLED=false（默认）时 COACH_CHAT 行为与现网完全一致
- 所有 Langfuse 上报必须异步，禁止在 SSE 热路径 await flush
- 观测范围仅 COACH_CHAT；不 trace Worker 侧重任务（plan/vision/memory_extract）
- DB 侧 toolTrace 摘要策略（ADR 0008）不变
- 用户未明确要求不要 git commit；回复简体中文

本地启动：
pnpm install
pnpm dev:stack
# 或分步：docker compose -f docker/docker-compose.yml up -d
#         pnpm --filter @fitness/api dev
pnpm lint && pnpm typecheck

Langfuse（启用观测时）：
- **本地自托管**（推荐，`pnpm dev:stack`）：UI http://127.0.0.1:3100，首次 init Key 见 `apps/api/.env.example`
- **Cloud**：在 Langfuse Cloud 创建项目，配置 LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_ENABLED=true

必读（按切片文档「前置阅读」为准）：
docs/issues/observability/OBS-XX.md
docs/adr/0010-coach-chat-observability-langfuse.md
docs/adr/0008-coach-agent-tools-and-memory.md
```

## 切片列表

| ID     | 文档                     | 类型 | 阻塞     | 交付                                              |
| ------ | ------------------------ | ---- | -------- | ------------------------------------------------- | ------- |
| OBS-01 | [OBS-01.md](./OBS-01.md) | AFK  | ADR 0010 | Langfuse SDK、env、flag + 非 Agent 路径 E2E trace | ✅ Done |
| OBS-02 | [OBS-02.md](./OBS-02.md) | AFK  | OBS-01   | Agent ReAct + tool span 全链路 trace              | ✅ Done |
| OBS-03 | [OBS-03.md](./OBS-03.md) | AFK  | OBS-02   | 验收脚本、AiRun 指针、HANDOFF 文档                | ✅ Done |
| OBS-04 | [OBS-04.md](./OBS-04.md) | AFK  | OBS-03   | Phase 2：Langfuse Prompt Management（工具描述）   |

### 依赖图

```
ADR 0010
   │
   ▼
OBS-01 ──► OBS-02 ──► OBS-03 ──► OBS-04 (Phase 2，有 trace 基线后再做)
```

**建议实施顺序**：ADR 0010 → 01 → 02 → 03 →（积累失败 case 后）04。

## 关键决策速查（详见 ADR 0010）

- 平台：**Langfuse Cloud Hobby**；LangSmith 当前不引入
- 集成：**包装 OpenAiCompatibleJsonClient**，不迁 LangChain ChatModel
- 范围：仅 **COACH_CHAT**（Agent + 非 Agent 流式）
- trace.id = **aiRunId**；sessionId = **conversationId**
- Phase 1：trace + generation + tool span；Phase 2：Prompt Management
- 默认 **LANGFUSE_ENABLED=false**，与 COACH_AGENT_ENABLED 独立

## 完成后交接

每份切片文档末尾有 **「交付物 / 下游」**。合并前请：

1. 勾选文档内 Acceptance criteria
2. PR 描述链接 `OBS-XX.md`
3. 若 env/契约变更，确保 `pnpm typecheck` 全仓通过
