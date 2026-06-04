# Fitness AI Assistant

> AI 驱动的健身助手 monorepo。**M0–M3 已闭环**；**M4 移动端 MVP + Coach（ADR 0007）主体已实装**；M5 联调/CI 待做。

## 文档

- [`docs/HANDOFF-M4-REMAINING.md`](./docs/HANDOFF-M4-REMAINING.md) — **M4 收口与遗留清单** **← 当前阶段入口**
- [`docs/HANDOFF-M4-AGENT.md`](./docs/HANDOFF-M4-AGENT.md) — M4/Coach 增量摘要（2026-06-04）
- [`docs/HANDOFF-M4.md`](./docs/HANDOFF-M4.md) — M4 范围与 API 约定
- [`docs/HANDOFF-M3.md`](./docs/HANDOFF-M3.md) — M3 交接（AI 核心；已关闭）
- [`docs/HANDOFF-M2.md`](./docs/HANDOFF-M2.md) — M2 交接（已验收）
- [`docs/PRD.md`](./docs/PRD.md) — 产品需求
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — 架构说明
- [`docs/adr/`](./docs/adr/) — 架构决策（含 **0007 Coach 对话**）

## 技术栈一句话总结

bare RN + NativeWind + rn-reusables 的 Android 优先客户端，配 NestJS 模块化单体（同 codebase HTTP + Worker + Cron 三入口）+ Postgres + Prisma + BullMQ/Redis + MinIO，AI 走 LangChain.js 编排 DeepSeek + Qwen-VL（计划/分析/Coach 流式），全栈 TypeScript + Zod 端到端类型安全，Turborepo + pnpm 管理。

## 环境前置要求

| 工具                 | 版本                                               |
| -------------------- | -------------------------------------------------- |
| Node.js              | 22 LTS（用 `nvm` / `fnm` 锁定，根目录有 `.nvmrc`） |
| pnpm                 | ≥ 9                                                |
| Docker Desktop       | latest（用于跑 postgres / redis / minio）          |
| JDK                  | 17（Android 构建）                                 |
| Android Studio       | 含 Android SDK 34+，Build Tools 34，NDK 26+        |
| Android 模拟器或真机 | Android 8.0+                                       |
| Git                  | latest                                             |

可选：

- VSCode + 推荐扩展（ESLint、Prettier、Prisma、Tailwind CSS IntelliSense）
- React Native Debugger / Flipper

## 一次性初始化

```powershell
# 1. 安装依赖（postinstall 会执行 prisma generate）
pnpm install

# 2. 拷贝环境变量（DATABASE_URL 默认用 127.0.0.1，可避免 Windows 上 localhost→IPv6 导致 Prisma 连不上库）
copy .env.example .env
copy .env.example packages\db\.env
copy .env.example apps\api\.env

# 3. 起本地依赖（仓库根目录执行）
docker compose -f docker/docker-compose.yml up -d

# 4. 数据库 migration + seed（首次加 --name）
pnpm --filter db migrate:dev --name init
pnpm --filter db seed

# 5.（可选）校验 seed：demo 约 86 动作 + 10 食物（见 packages/db seed）
pnpm --filter db verify:seed
```

克隆后 **`pnpm install`** 会执行 **`prepare` → `husky`**，将 Git `core.hooksPath` 指向 `.husky`（并生成本地 `.husky/_`，该目录默认不入库）。提交时自动跑 **lint-staged**（暂存文件的 ESLint + Prettier）与 **commitlint**（须符合 [Conventional Commits](https://www.conventionalcommits.org/)）。临时跳过钩子可用 `git commit --no-verify`（仅限确有理由时使用）。

## 日常开发命令

```powershell
# 启 HTTP API（监听 3000；Swagger：http://localhost:3000/swagger）
pnpm --filter api start:api

# 启 BullMQ Worker（消费 AI 任务：计划/识图/部分 COACH 副作用）
pnpm --filter api start:worker

# 启定时任务（mesocycle 复盘等）
pnpm --filter api start:cron

# 启 RN Metro
pnpm --filter mobile start

# 跑 Android（确保有连接的设备 / 模拟器）
pnpm --filter mobile android

# 全仓 lint / typecheck / test
pnpm lint
pnpm typecheck
pnpm test

# 验收脚本（需 Docker + API/worker）
.\scripts\m2-acceptance.ps1
.\scripts\m3-acceptance.ps1   # 需 LLM Key
.\scripts\m4-acceptance.ps1

# 一键并发跑（turbo 编排）
pnpm dev
```

## 当前进展

- [x] 需求 & 架构规划
- [x] Monorepo、Prisma、Docker、shared Zod、CI、ADR 0001–0007
- [x] `apps/api` HTTP + Worker + Cron（auth、users、exercises、foods、media、ai-tasks、meal-logs、plans、**conversations**）
- [x] `packages/ai-core`（餐照、计划生成、**Coach 流式对话**）
- [x] `apps/mobile` bare RN MVP（Auth、档案、仪表盘、训练计划+打卡、餐照、饮食日志）
- [x] **Coach Tab**（多轮对话、SSE 流式、Markdown、计划/识图/记餐入口）
- [x] Onboarding 末步生成训练+饮食双计划（`OnboardingPlanBootstrap`）
- [ ] **M4 正式关闭**（验收脚本扩展、部分 P1、见 HANDOFF-M4-REMAINING）
- [ ] **M5** 联调与 APK CI

**产品备注**：仪表盘**不**做「今日体重」独立卡片；体重仅在档案与消耗估算中使用（见 PRD F6 注）。

## CI

- 触发：**`pull_request`**、向 **`main`** 的 **`push`**
- 工作流：[`.github/workflows/ci.yml`](./.github/workflows/ci.yml)（`pnpm lint` → `pnpm typecheck` → `pnpm test`；安装阶段设 `HUSKY=0` 跳过 husky，仍会执行包含 `prisma generate` 的 `postinstall`）
- Android APK 构建归属 **M5**

## Roadmap

| 阶段   | 目标               | 状态                                                                           |
| ------ | ------------------ | ------------------------------------------------------------------------------ |
| M0–M1  | 架构与基础设施     | ✅                                                                             |
| M2     | 后端 MVP           | ✅                                                                             |
| M3     | AI 核心闭环        | ✅ · [`HANDOFF-M3.md`](./docs/HANDOFF-M3.md)                                   |
| **M4** | 移动端 MVP + Coach | **主体 ✅** · 收口 [`HANDOFF-M4-REMAINING.md`](./docs/HANDOFF-M4-REMAINING.md) |
| **M5** | 联调与 CI          | ⬜ APK、Sentry、真机文档                                                       |
| M6+    | Phase 2            | 报告、社区等                                                                   |

## 项目约定

- 严格遵守 [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) §8 的设计与编码规范
- 重大架构变更必须先在 `docs/adr/` 新增 ADR 再实施
- 不上敏感数据（`.env` 永远 ignore），密钥走个人环境变量

## 许可

私有项目，仅供个人学习使用。
