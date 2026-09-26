# Coach 记忆系统 · 分切片实施文档

> **Epic**：长期记忆从「每轮 Pro 抽取 + 按时间全量注入」升级为「工具化写入 + 记忆索引常驻 + Meili 混合召回」
> **架构依据**：[ADR 0012](../../adr/0012-coach-memory-tooling-and-hybrid-recall.md)
> **前提**：ADR 0008 的工具执行架构（`ToolRegistry`、`CoachAgentRunner`、SSE、卡片确认）继续有效；本 Epic 取代 0008 §1 的 flag 默认值、§3 的长期记忆读写、§9 的「不做向量记忆」
> **状态（2026-09-24）**：代码、迁移、索引回填与 golden-set 评测已完成；对话和移动端的人工端到端验收按各切片清单执行。

## 给接手 Agent 的通用说明

复制下面整段到新会话开头，再附上你所负责切片的文档全文。

```
你是 Fitness AI Assistant monorepo 的实施 Agent，负责 docs/issues/memory/MEM-XX.md 所描述的单一切片。

环境：Windows + PowerShell；pnpm monorepo；bare React Native（禁止 Expo）。
契约：packages/shared 的 Zod 为唯一端到端真相；重大架构变更需 ADR，本 Epic 以 ADR 0012 为准。
硬性约束：
- 客户端禁止直连 LLM / Meilisearch / DashScope Key（ADR 0003/0004/0012）
- 记忆 value 不得进入 toolTrace、日志或 Message.metadata（ADR 0012 §2）
- 记忆检索必须强制按 userId 过滤，禁止向调用方暴露裸 filter（ADR 0012 §4）
- injury 与 diet_restriction 的 value 常驻注入，不得只靠检索召回（ADR 0012 §3）
- 用户手动删除的 key 进入抑制名单，Agent 不得自动重建（ADR 0012 §1）
- 重任务仍走 BullMQ；save_memory 立即返回「已记录」，落库与索引在 MEMORY_PERSIST job
- 用户未明确要求不要 git commit；回复简体中文

本地启动：
pnpm install
docker compose -f docker/docker-compose.yml up -d
pnpm --filter db migrate:dev
pnpm --filter api start:worker
pnpm --filter api start:api
pnpm lint && pnpm typecheck

必读（按切片文档「前置阅读」为准）：
docs/issues/memory/MEM-XX.md
docs/adr/0012-coach-memory-tooling-and-hybrid-recall.md
docs/adr/0008-coach-agent-tools-and-memory.md
docs/ARCHITECTURE.md
```

## 切片列表

| ID     | 文档                     | Wave | 类型 | 阻塞     | 状态 | 交付                                                          |
| ------ | ------------------------ | ---- | ---- | -------- | ---- | ------------------------------------------------------------- |
| MEM-01 | [MEM-01.md](./MEM-01.md) | W0   | AFK  | ADR 0012 | ✅   | golden set（≥20），召回与准入 prompt 的调参前提               |
| MEM-02 | [MEM-02.md](./MEM-02.md) | W1   | AFK  | 01       | ✅   | 类别 schema、软删除、审计表、抑制名单、迁移回填、校验单测     |
| MEM-03 | [MEM-03.md](./MEM-03.md) | W2   | AFK  | 02       | ✅   | save/forget 工具、MEMORY_PERSIST（仅落库）、拆除抽取、flag    |
| MEM-04 | [MEM-04.md](./MEM-04.md) | W3a  | AFK  | 02       | ✅   | embedding client、Meili 记忆索引、隔离检索、reindex           |
| MEM-05 | [MEM-05.md](./MEM-05.md) | W3b  | AFK  | 03、04   | ✅   | 记忆索引与安全记忆 prompt、recall_memory、降级、semanticRatio |
| MEM-06 | [MEM-06.md](./MEM-06.md) | W4   | AFK  | 03、05   | ✅   | 用户记忆管理 API、移动端页面、Langfuse 指标                   |

MEM-03 与 MEM-04 都只阻塞于 MEM-02，可以并行。MEM-05 把召回接到对话上，两边都要等。

## 并行切片的接缝

`MEMORY_PERSIST` 由 MEM-03 创建，当时只做「upsert + 审计事件」。embedding 与 Meili 写入由 MEM-04 接到**同一个 job** 上，MEM-03 不得预写检索代码。MEM-03 完成时 `embeddedAt` 保持 `null` 即合格。

MEM-02 上线后，旧的 `memory_extract` 仍会写库，直到 MEM-03 拆除。因此 MEM-02 必须让 `applyPatches` 能写入新 schema，否则迁移一上线抽取就失败。

## 完成后交接

每个切片文档末尾有 **「交付物 / 下游」**。合并前请：

1. 勾选文档内 Acceptance criteria
2. 在 PR 描述中链接 `MEM-XX.md`
3. 若改了 `packages/shared` 契约，确保 `pnpm typecheck` 全仓通过
