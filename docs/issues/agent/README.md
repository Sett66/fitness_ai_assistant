# Coach 真 Agent · 分 Issue 实施文档

> **Epic**：Coach 从「单次流式 LLM」升级为「LangGraph ReAct + 服务端工具 + 分层记忆」  
> **索引**：[AGENT-ISSUES.md](../../AGENT-ISSUES.md)（依赖图与 Wave）  
> **前提**：M4 已关闭；M5 当前阶段

## 给接手 Agent 的通用说明

复制下面整段到新会话开头，再附上你所负责 Issue 的文档全文。

```
你是 Fitness AI Assistant monorepo 的实施 Agent，负责 docs/issues/agent/AGENT-XX.md 所描述的单一切片。

环境：Windows + PowerShell；pnpm monorepo；bare React Native（禁止 Expo）。
契约：packages/shared 的 Zod 为唯一端到端真相；重大架构变更需 ADR。
硬性约束：
- 客户端禁止直连 LLM / 地图 Key（ADR 0003）
- COACH 流式走 POST /v1/conversations/:id/messages/stream（SSE）
- 重任务（计划/识图）仍 BullMQ Worker；Agent 只 enqueue，不在 SSE 内跑 VLM
- 用户未明确要求不要 git commit；回复简体中文

本地启动：
pnpm install
docker compose -f docker/docker-compose.yml up -d
pnpm --filter api start:worker
pnpm --filter api start:api
pnpm lint && pnpm typecheck

必读（按 Issue 文档「前置阅读」为准）：
docs/issues/agent/AGENT-XX.md
docs/adr/0008-coach-agent-tools-and-memory.md
docs/adr/0007-coach-conversation-and-chat.md
docs/ARCHITECTURE.md
```

## Issue 文档列表

| ID              | 文档                                       | Wave | 类型 | 阻塞       | 状态    |
| --------------- | ------------------------------------------ | ---- | ---- | ---------- | ------- |
| AGENT-01        | [AGENT-01.md](./AGENT-01.md)               | W0   | HITL | —          | ✅ Done |
| AGENT-02        | [AGENT-02.md](./AGENT-02.md)               | W1   | AFK  | 01         |         |
| AGENT-03        | [AGENT-03.md](./AGENT-03.md)               | W1   | AFK  | 01, 02     |         |
| AGENT-04        | [AGENT-04.md](./AGENT-04.md)               | W1   | AFK  | 02         |         |
| AGENT-05        | [AGENT-05.md](./AGENT-05.md)               | W1   | AFK  | 01, 02     |         |
| AGENT-06        | [AGENT-06.md](./AGENT-06.md)               | W2   | AFK  | 02, 05     |         |
| AGENT-07        | [AGENT-07.md](./AGENT-07.md)               | W3   | AFK  | 03, 04, 06 |         |
| AGENT-08        | [AGENT-08.md](./AGENT-08.md)               | W3   | AFK  | 06         |         |
| AGENT-09        | [AGENT-09.md](./AGENT-09.md)               | W3   | AFK  | 02, 03     |         |
| AGENT-10        | [AGENT-10.md](./AGENT-10.md)               | W4   | AFK  | 07, 08     |         |
| MEAL-QUALITY-01 | [MEAL-QUALITY-01.md](./MEAL-QUALITY-01.md) | 并行 | AFK  | —          |         |

## 完成后交接

每个 Issue 文档末尾有 **「交付物 / 下游依赖」**。合并前请：

1. 勾选文档内 Acceptance criteria
2. 在 PR 描述中链接 `AGENT-XX.md`
3. 若 ADR/契约变更，确保 `pnpm typecheck` 全仓通过
