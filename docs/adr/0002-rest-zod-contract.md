# 0002 — REST API 与 Zod 端到端契约

## Context

[`docs/PRD.md`](../PRD.md) 要求训练、饮食、AI 任务、上传等多模块协作；[`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) §8.1 规定：**跨端类型从 `packages/shared` 的 Zod schema `infer`，禁止两端手写同名 interface**。后端计划使用 **nestjs-zod** 等与 Zod 集成的校验方式（M2）。

## Decision

- **单一事实来源**：所有对外（或可共享）的 DTO / 响应形状在 **`packages/shared`** 中以 **Zod** 定义；TypeScript 类型一律 **`z.infer<typeof Schema>`**。
- **版本与兼容性**：**Zod 锁 `~3.23.x`**，与 nestjs-zod 等生态对齐；不混用 Zod v4 API（见 [`docs/HANDOFF.md`](../HANDOFF.md) §4 坑 #3）。
- **错误形状**：统一为 ARCH §8.2 —— `code` + `message` + 可选 `details`；错误码枚举与中文默认文案放在 `packages/shared`。
- **HTTP 形态**：REST，`/v1/{resource}`，JSON；multipart 走**预签名直传对象存储**（见 ADR 0004），不在此 ADR 展开。

## Consequences

- **正面**：Mobile、API、Worker 共用同一份校验与类型；文档化成本低（schema 即契约）。
- **负面**：共享包变更会牵动多端；重大破坏性变更需版本化或同步发布（MVP 阶段以同分支迭代为主）。
- **NestJS**：M2 在 DTO 层复用 shared 的 Zod，避免在 controller 侧重复维护 TS interface。

## Status

Accepted · 2026-05-18
