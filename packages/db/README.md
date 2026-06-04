# @fitness/db

PostgreSQL 数据访问层：Prisma schema / 单例 client / seed。

## 快速使用

```powershell
# 1. 准备 .env（参考 .env.example，默认指向 docker compose 起的本地 pg）
copy .env.example .env

# 2. 启动本地依赖（在仓库根执行）
docker compose -f docker/docker-compose.yml up -d

# 3. 生成 Prisma client
pnpm --filter db generate

# 4. 首次创建迁移
pnpm --filter db migrate:dev --name init

# 5. 灌入 seed 数据（86 预置动作 + 10 官方食物）
pnpm --filter db seed

# 6. 打开 Prisma Studio 可视化（端口 5557，避免与 Android 模拟器 adb 5555 冲突）
pnpm --filter db studio
# 浏览器手动打开 http://127.0.0.1:5557
```

## 提供的 npm scripts

| script           | 作用                                              |
| ---------------- | ------------------------------------------------- |
| `prisma`         | 直接调用 prisma CLI（透传）                       |
| `generate`       | `prisma generate` 生成 client 到 `src/generated/` |
| `migrate:dev`    | 开发环境创建并应用 migration                      |
| `migrate:deploy` | 部署环境只应用，不创建（CI 用）                   |
| `migrate:reset`  | 重置数据库（删表重建，不跑 seed）                 |
| `studio`         | 打开 Prisma Studio                                |
| `format:schema`  | `prisma format` 美化 schema.prisma                |
| `seed`           | 跑 `prisma/seed.ts`，灌入预置动作 + 官方食物      |

## 设计要点

- 主键：所有表 `@default(cuid(2))`（Prisma ≥ 5.17 原生支持）
- 软删除：业务表带 `deletedAt: DateTime?`，运行时拦截 TODO（M2 在 `src/client.ts` 用 `$extends` 实装）
- Generator 输出：`packages/db/src/generated/`（已在根 `.gitignore` 排除，规避 pnpm hoist 冲突）
- 单例 PrismaClient：走 `globalThis.__fitnessPrisma` 缓存防 hot-reload 多实例

## Phase 2 占位表

`Post / Comment / Reaction / PartnerProfile` 已经建表但 MVP 不开放对外 API，等 Phase 2 启用时上线。
