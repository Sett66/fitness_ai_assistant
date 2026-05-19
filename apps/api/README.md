# @fitness/api

NestJS 模块化单体。**同 codebase / 三启动入口**（HTTP / BullMQ Worker / Cron），共享所有 `*.module.ts` 与 Prisma client。

> **状态：M1 占位**
>
> - 真实实现见 **M2**：auth / users / exercises / foods / media / ai-tasks 框架，worker 跑通空任务，Swagger 可看
> - **M3**：在 worker 中接入 `@fitness/ai-core`

## 计划目录结构（M2 落地）

详见 `docs/ARCHITECTURE.md` §3.

```
src/
├── main.ts                  # HTTP 服务入口（监听 3000）
├── worker.ts                # BullMQ worker 入口（不开 HTTP）
├── schedule.ts              # @nestjs/schedule cron 入口
├── app.module.ts            # 根模块
├── common/                  # filters / interceptors / decorators / pipes(ZodValidationPipe) / guards
├── config/                  # @nestjs/config schema + 校验
├── infra/                   # prisma / queue / storage / logger / llm
└── modules/                 # auth / users / exercises / foods / workouts / plans / nutrition / media / ai-tasks / dashboard
    └── workers/             # BullMQ Processors
```

## M2 依赖清单（届时添加，**M1 不要装**）

- `@nestjs/{common,core,platform-express,config,swagger,schedule}`
- `nestjs-zod` / `nestjs-pino` / `pino`
- `argon2` / `passport` / `passport-jwt` / `passport-local`
- `bullmq` / `ioredis`
- `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner`

## TODO（M2/M3）

- [ ] HTTP 启动 + Swagger
- [ ] auth 模块（注册 / 登录 / 刷新 / 撤销）
- [ ] users / profile / strength-levels 模块
- [ ] media presigned 上传链路
- [ ] ai-tasks 任务投递 + 状态查询
- [ ] worker.ts 注册 BullMQ Processor
- [ ] schedule.ts 注册 mesocycle 复盘 cron
