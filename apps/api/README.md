# @fitness/api

NestJS 模块化单体。**同 codebase / 三启动入口**（HTTP / BullMQ Worker / Cron），共享 Prisma 与领域模块。

> **状态：M2 HTTP MVP ✅ · M3 AI Worker ✅ · Coach 对话（ADR 0007）✅**

## 启动

```powershell
pnpm --filter api start:api      # HTTP :3000，Swagger /swagger
pnpm --filter api start:worker   # BullMQ：MEAL_VISION、PLAN_GENERATE_*、COACH 副作用等
pnpm --filter api start:cron     # 定时任务（当前多为占位）
```

环境：`apps/api/.env`（由 `load-api-env.ts` 加载）；需 `DEEPSEEK_API_KEY`、`DASHSCOPE_API_KEY`（AI 功能）、Docker 中 Postgres/Redis/MinIO。

## 模块概览

| 模块              | 说明                                                |
| ----------------- | --------------------------------------------------- |
| auth / users      | 注册登录、档案、力量等级                            |
| exercises / foods | 库查询                                              |
| uploads           | 预签名上传（`clientPublicEndpoint` 供模拟器/真机）  |
| ai-tasks          | 异步任务投递与轮询                                  |
| meal-logs         | 饮食日志与 daily-summary                            |
| plans             | 计划 CRUD、训练打卡 sessions                        |
| **conversations** | 多轮会话；`POST .../messages/stream` SSE Coach CHAT |

## 目录结构

详见 `docs/ARCHITECTURE.md` §3.

```
src/
├── main.ts / worker.ts / schedule.ts
├── app.module.ts
├── common/          # filters, guards, Zod parse
├── config/
├── infra/           # prisma, queue, storage
├── domain/          # user-context, plan-persistence, conversation-side-effect
└── modules/         # 各 HTTP 模块 + workers/ai-task.processor.ts
```

## 相关文档

- [`docs/HANDOFF-M2.md`](../../docs/HANDOFF-M2.md)
- [`docs/HANDOFF-M3.md`](../../docs/HANDOFF-M3.md)
- [`docs/adr/0007-coach-conversation-and-chat.md`](../../docs/adr/0007-coach-conversation-and-chat.md)
