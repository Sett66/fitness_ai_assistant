# 0003 — 模块化单体 + 独立 Worker / Cron 进程

## Context

AI 调用必须**异步**，HTTP 不得阻塞等待 LLM（[`docs/PRD.md`](../PRD.md) §5.3；[`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §5）。同时希望避免过早拆成多个仓库或多套业务代码拷贝。

## Decision

**同一 NestJS codebase（模块化单体）**，共享所有 `*.module.ts`、Prisma、`packages/ai-core`，通过**不同入口**拆进程：

| 入口文件      | 启动命令（规划）                 | 职责                                             |
| ------------- | -------------------------------- | ------------------------------------------------ |
| `main.ts`     | `pnpm --filter api start:api`    | HTTP（/v1、Swagger）                             |
| `worker.ts`   | `pnpm --filter api start:worker` | 仅注册 **BullMQ** Consumer，消费 AI 等队列       |
| `schedule.ts` | `pnpm --filter api start:cron`   | `@nestjs/schedule`，如 mesocycle 复盘触发（M2+） |

基础设施：**PostgreSQL**（持久化）+ **Redis**（BullMQ broker / 可选缓存）。HTTP 入队任务后立即返回 **`taskId` / `aiRunId`**，Worker 内执行 LangGraph / Chain 并回写 DB（M3 细节另述）。

## Consequences

- **正面**：部署简单（MVP 单机/单 compose）；业务逻辑一处维护；与 PRD「任务 + ai_runs 落库」一致。
- **负面**：Worker 与 API **资源争用**同一机器时须限流；日后 DAU 上升可按 ARCH §9 将 Worker 单独容器扩缩。
- **运维**：开发期三个终端各跑一进程；生产可合并或拆容器，无需改模块边界。

## Status

Accepted · 2026-05-18
