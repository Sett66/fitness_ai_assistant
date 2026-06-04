# 交接文档 · M2 阶段（后端 MVP / `apps/api`）

> **M2 已关闭（已验收）。当前阶段入口：** [`docs/HANDOFF-M3.md`](./HANDOFF-M3.md)。  
> 本文档保留 M2 范围、约束与验收定义；与 [`docs/HANDOFF.md`](./HANDOFF.md)（M1）互补。

---

## 0. 给下一位 Agent 的「系统提示」——请整段复制新开会话

```
你是接手 Fitness AI Assistant 项目的开发 Agent。M1 已完成，当前进入 M2。

项目根目录（Windows + PowerShell）：用户本地路径以用户消息为准；仓库为 pnpm + Turborepo monorepo。

硬性约束（不要重新讨论）：
1. 用户环境：Windows、PowerShell；不要用 bash 式命令（mkdir -p、rm -rf、cp）；脚本优先 .ps1 或跨平台 npm 包。
2. 回复语言：简体中文；代码注释可用中文。
3. ARCHITECTURE / PRD / 已有 ADR 中的架构决策已锁定；若发现矛盾，先写 ADR 草稿再让用户确认，不要擅自改 PRD/ARCHITECTURE 正文。
4. mobile：M2 不 init React Native、不装 Expo（bare RN 路线，M4 再做）。
5. ai-core：M2 不实现真实 LangChain 调用（M3）；M2 只做队列 + 空/桩 Processor + HTTP 投递与查询框架。
6. 契约：HTTP DTO 与响应形状以 packages/shared 的 Zod 为准；类型用 z.infer，禁止手写重复 interface。
7. 包引用：workspace 协议 @fitness/*；apps/api 需显式依赖 @prisma/client（pnpm isolate + Prisma 惯例）。
8. Git：用户未明确要求时不要代执行 git commit；提交信息需 Conventional Commits（husky + commitlint）。

M2 目标（README Roadmap）：在 apps/api 落地 NestJS——auth、users、exercises、foods、media（presigned）、ai-tasks 框架；worker 跑通空任务；Swagger 可浏览。路由前缀 /v1，错误形如 ARCHITECTURE §8.2。

必读顺序：docs/HANDOFF-M2.md（本文件）→ docs/PRD.md（F1/F7 相关、§5 业务规则）→ docs/ARCHITECTURE.md（§3 apps/api 目录、§6 上传、§7 鉴权、§8 规范）→ docs/adr/0002、0003、0004。

数据库： packages/db 已有 Prisma schema 与 seed；本地用 docker/docker-compose.yml；Windows 下 DATABASE_URL 建议 127.0.0.1 而非 localhost（避免 Prisma IPv6 问题）。

开始做事前：跑一次 pnpm install、pnpm typecheck、（Docker 起后）pnpm --filter db migrate:dev 与 seed；再实现 NestJS。
```

---

## 1. M1 已交付（你无需重做）

| 领域      | 位置 / 说明                                                                      |
| --------- | -------------------------------------------------------------------------------- |
| Workspace | `pnpm-workspace.yaml`、`turbo.json`、根 `tsconfig.base.json`                     |
| 共享配置  | `packages/config`（ESLint / Prettier / tsconfig）                                |
| 契约      | `packages/shared`（Zod、错误码、`/v1` 相关 schema 含 auth、media、ai-task 等）   |
| 数据库    | `packages/db`（Prisma、`src/generated`、`seed` 5 运动 + 10 食物）                |
| 基础设施  | `docker/docker-compose.yml`（pg/redis/minio + `media` bucket）                   |
| 占位      | `apps/mobile`、`packages/ui`、`packages/ai-core` 仍为占位，M2 以 `apps/api` 为主 |
| CI        | `.github/workflows/ci.yml`（lint/typecheck/test；`HUSKY=0` 安装）                |
| 规范      | husky、lint-staged、commitlint；根 `eslint.config.cjs`                           |
| ADR       | `docs/adr/0001`–`0004`                                                           |

---

## 2. M2 范围：必须做

按 [`README.md`](../README.md) Roadmap 与 [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) §3 `apps/api` 树：

### 2.1 HTTP（`src/main.ts`）

- **全局**：`ConfigModule`（.env 校验）、统一异常过滤器、`BizException` + `ApiError` 形状（对齐 `@fitness/shared`）、`nestjs-pino` 或同等日志（ARCH 要求 pino）。
- **路由**：`/v1/...`，复数 resource；**Swagger**（`@nestjs/swagger`）在 dev 可打开。
- **鉴权**（[`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) §7 + PRD F1）
  - 注册 / 登录 / refresh / 登出（撤销 Session）。
  - 密码 **argon2**；access JWT + refresh token（Session 表存 refresh 哈希）。
  - 与 `packages/shared` 里 `RegisterRequest` / `LoginRequest` / `TokenPair` 等保持一致。
- **users**
  - Profile CRUD、StrengthLevel 读写（与 Prisma 模型对齐）。
- **exercises / foods**
  - 列表 + 详情 + 用户自建（preset 只读策略与 PRD F7 一致）；分页可与 shared 中 pagination 工具对齐。
- **media**（ADR 0004）
  - `POST /v1/uploads/sign`、`POST /v1/uploads/complete`；`StorageProvider` + MinIO（`@aws-sdk/client-s3` + presigner）；配置对齐根 `.env.example` 的 `S3_*`。
- **ai-tasks**（框架）
  - 投递任务 → 写 `AiRun`（QUEUED）→ BullMQ `add`；`GET /v1/ai/tasks/:id` 查状态。
  - **M2 不要求**真实 LLM；Processor 内 sleep 或写 `DONE` 桩即可，但表字段要可扩展。

### 2.2 Worker（`src/worker.ts`）

- 单独 bootstrap：无 HTTP（或仅 health 可选），注册 **BullModule**、消费与 HTTP 相同的队列名常量。
- **Processors**（`src/workers/`）：至少注册与 ai-tasks 投递对应的队列；M2 处理函数可为「更新 AiRun 为 DONE + 假输出」。

### 2.3 Cron（`src/schedule.ts`）

- 可只挂载 `ScheduleModule`，**空任务或占位**；mesocycle 复盘逻辑留给后续。

### 2.4 `apps/api` 工程化

- **nestjs-cli**、`nest-cli.json`、`package.json` 脚本：`start:dev` / `start:api` / `start:worker` / `start:cron` / `build`。
- **依赖**：`@nestjs/*`、`argon2`、`passport` + `passport-jwt`、`bullmq`、`ioredis`、`@aws-sdk/client-s3`、`@aws-sdk/s3-request-presigner`、`nestjs-zod`、`@nestjs/swagger`、`pino` + `nestjs-pino`、`@prisma/client`（**workspace 外加 resolution 按项目惯例**）、`@fitness/db`、`@fitness/shared`。
- **Prisma**：`infra/prisma` 封装 `PrismaService`，`onModuleInit` 连接 `$connect`，与应用共享 `packages/db` 导出客户端。
- **ESLint**：可为 `apps/api` 增加 `eslint.config.cjs`（继承 `packages/config`），保证 `pnpm lint` 过。

### 2.5 环境与文档

- 新增 **`apps/api/.env.example`**（`DATABASE_URL`、`REDIS_URL`、JWT、`S3_*` 等），并在根 `README` 或 `docs/` 简短说明复制方式。
- 若引入新重大决策 → **`docs/adr/` 新编号**（不要改旧 ADR 历史条目含义）。

---

## 3. M2 明确不做（防范围膨胀）

| 不做                                              | 归属阶段                      |
| ------------------------------------------------- | ----------------------------- |
| 真实 DeepSeek / Qwen 调用、LangGraph / Chain 实现 | **M3** `packages/ai-core`     |
| 计划生成 / 饮食生成业务闭环、复杂复盘             | M3+（M2 仅需队列 + AiRun 桩） |
| `apps/mobile` 初始化、bare RN、Metro              | **M4**                        |
| Phase 2 表（Post 等）开放 API                     | 禁止；表已在 DB，API 勿暴露   |
| APK、android.yml 扩展                             | **M5**                        |
| Expo 任何依赖                                     | 永久禁止                      |

---

## 4. 建议实施顺序（垂直切片）

1. Nest 脚手架 + `AppModule` + Config + Prisma + 全局异常 + Swagger。
2. **auth**（注册登录 refresh）+ **users/profile**（依赖 JWT Guard）。
3. **exercises** + **foods**（读 seed + 用户 CRUD）。
4. **infra/storage** + **media**（sign/complete，联通 MinIO）。
5. **infra/queue** + **ai-tasks** HTTP + **worker** 空 Processor + **schedule** 占位。
6. 补 **apps/api** 的 `lint`/`typecheck`/`test`（至少 smoke），确保 **CI 绿**。

---

## 5. 验收标准（M2 完成定义）

满足下列可认为 M2 收尾（在用户本机 + CI 均可复现）：

- [x] `pnpm --filter api build` 成功；`pnpm --filter api start:api` 可访问 **Swagger** 与 `/v1` 健康或根路径说明。
- [x] 新用户可 **注册 → 登录 → refresh**；错误响应为统一 JSON 形状（`scripts/m2-acceptance.ps1` 已覆盖）。
- [x] Profile / StrengthLevel 可读写（与 Zod + Prisma 一致）。
- [x] Exercise/Food 列表与自建接口可用（与 seed 5 动作 + 10 食物一致）。
- [x] **sign → PUT MinIO → complete** 链路可跑通，`Media` 表 **READY**（Windows 需 `S3_ENDPOINT=http://127.0.0.1:9000`，见 `load-api-env.ts`）。
- [x] 投递 AI 任务返回 **taskId**，查询 **DONE**（桩）；**worker** 单独进程消费（先起 worker 再起 API 或并行）。
- [x] `pnpm lint` / `pnpm typecheck` / `pnpm test` 全仓通过；GitHub **CI** 待 push 后在 Actions 确认。

> **会话级交接明细**（已实现模块、坑位、Git 状态）：[`docs/HANDOFF-M2-AGENT.md`](./HANDOFF-M2-AGENT.md)

---

## 6. 坑位备忘（继承 M1 + M2 专项）

1. **Prisma**：`apps/api` **显式** `dependencies` 含 `@prisma/client`；`DATABASE_URL` 建议 **127.0.0.1**（Windows）。
2. **Zod**：保持 **v3.23.x**；DTO 与 `nestjs-zod` 对齐。
3. **BullMQ**：Redis URL 与 docker-compose 一致；队列名常量化，避免 HTTP/Worker 不一致。
4. **MinIO**：endpoint path-style、region 与 `.env.example` 对齐；预签名过期时间与上传大小限制与 shared 常量可对齐。
5. **JWT**：secret 仅从 env 读取，勿入库；与 `packages/shared` 中 token TTL 常量（若已定义）一致。
6. **不要提交**：`.env`、`apps/api/.env`；只提交 `.env.example`。

---

## 7. 参考文档锚点

| 主题        | 文档 §                     |
| ----------- | -------------------------- |
| 目录与模块  | ARCHITECTURE §3 `apps/api` |
| 上传        | ARCHITECTURE §6、ADR 0004  |
| 鉴权        | ARCHITECTURE §7            |
| 编码规范    | ARCHITECTURE §8            |
| AI 异步标准 | ARCHITECTURE §5、PRD §5.3  |
| 契约        | ADR 0002                   |
| 三进程模型  | ADR 0003                   |

---

## 8. Status

本文档随 M2 开工启用；若 M2 范围有经用户批准的调整，在本文件末尾追加 **修订记录**（日期 + 一行说明）即可。

_文档版本：v1 · 2026-05-18_

### 修订记录

| 日期       | 说明                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-19 | M2 主体代码已落地；新增 [`HANDOFF-M2-AGENT.md`](./HANDOFF-M2-AGENT.md) 会话交接；§5 勾选部分本机已验证项                     |
| 2026-05-19 | M2 收尾验收：`scripts/m2-acceptance.ps1` 全绿；`load-api-env.ts` 固定加载 `apps/api/.env`；根 `.env.example` S3 改 127.0.0.1 |
| 2026-05-19 | **M2 关闭**；M3 主入口迁至 [`HANDOFF-M3.md`](./HANDOFF-M3.md)                                                                |
