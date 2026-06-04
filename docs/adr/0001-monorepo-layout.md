# 0001 — Monorepo 包布局（apps×2 + packages×5）

## Context

项目需要**移动端 + 后端 + 共享契约 + 数据层 + AI 编排**，且坚持单仓（single repo）以降低端到端类型与发布协调成本。详见 [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §3 目录树与 §1 技术栈（pnpm workspace、Turborepo、TypeScript strict）。

## Decision

采用 **pnpm workspace + Turborepo** 管理 monorepo，包划分为：

| 类型         | 包                 | 职责                                                                |
| ------------ | ------------------ | ------------------------------------------------------------------- |
| **apps**     | `apps/api`         | NestJS 模块化单体（HTTP / Worker / Cron 三入口，M2 起实装）         |
| **apps**     | `apps/mobile`      | bare React Native，Android 优先（M4 起实装）                        |
| **packages** | `packages/shared`  | Zod schema、枚举、常量、错误码、中文文案 —— **REST 与端上共享契约** |
| **packages** | `packages/ui`      | RN 通用组件（M4 + `react-native-reusables`）                        |
| **packages** | `packages/ai-core` | LangChain / LangGraph 工作流（M3）                                  |
| **packages** | `packages/db`      | Prisma schema、migrations、单例 client、seed                        |
| **packages** | `packages/config`  | 共享 `tsconfig` / ESLint flat / Prettier                            |

对内依赖统一 **`@fitness/<pkg>`** 命名空间，`package.json` 使用 **`"workspace:*"`**。根目录用 **`turbo.json`** 编排 `build` / `dev` / `lint` / `typecheck` / `test`。

## Consequences

- **正面**：契约（Zod）与 DB schema 同仓演进；CI 一次 `pnpm install` + turbo 可跑全包检查。
- **负面**：clone 体积与安装依赖随包增多；新人需理解 workspace 路径与 `turbo` 任务图。
- **备注**：主键在 PRD 中写为 cuid2；当前 Prisma 5.x 内置 `@default(cuid())` 无参形式，与「cuid2」字面不完全等价，若未来强制 cuid2 需在应用层生成 id 并另起 ADR。

## Status

Accepted · 2026-05-18
