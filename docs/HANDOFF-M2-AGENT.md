# M2 会话交接 · 给下一位 Agent（已关闭）

> **M2 已关闭。M3 主入口：** [`docs/HANDOFF-M3.md`](./HANDOFF-M3.md)（含可复制系统提示词）。  
> 本文档仅作 M2 收尾会话的历史记录；范围与验收定义见 [`docs/HANDOFF-M2.md`](./HANDOFF-M2.md)。

**状态（2026-05-19）**：M2 验收已完成（`scripts/m2-acceptance.ps1` 19/19）。**勿再扩 M2 范围。**

---

## 1. 项目整体进度（Roadmap）

| 阶段 | 状态 | 说明 |

|------|------|------|

| M0 架构规划 | ✅ | `docs/PRD.md`、`docs/ARCHITECTURE.md` |

| M1 Monorepo + 基础设施 | ✅ | workspace、docker、Prisma+seed、shared Zod、CI 骨架、ADR 0001–0004 |

| **M2 后端 MVP (`apps/api`)** | **✅ 已验收** | Nest 三入口、业务模块、Swagger；E2E 脚本全绿 |

| M3 AI 核心 | ⬜ | `packages/ai-core` 仍为占位 |

| M4 Mobile | ⬜ | `apps/mobile` 占位 |

| M5 联调/APK CI | ⬜ | |

---

## 2. 本会话增量（相对上一版交接）

### 2.1 验收与脚本

- 新增 **`scripts/m2-acceptance.ps1`**：覆盖 §5 全链路（auth、profile、exercise/food、MinIO PUT、AI 任务 + worker、Swagger）。

- 本机结果：**19 passed / 0 failed**（需 Docker + 先起 worker 再起 API，或并行）。

### 2.2 Windows / 环境修复

- **`apps/api/src/load-api-env.ts`**：三入口（`main` / `worker` / `schedule`）启动前 `override` 加载 **`apps/api/.env`**，避免 monorepo 根 `.env` 里 `S3_ENDPOINT=localhost` 盖掉 API 配置（预签名 URL 在 Windows 上会挂起）。

- 根 **`.env.example`**：`S3_ENDPOINT` 改为 `http://127.0.0.1:9000`（与 `DATABASE_URL` 一致）。

- **`apps/api`** 增加依赖 **`dotenv`**。

- MinIO PUT 在脚本内用 **`curl.exe`**（避免 `Invoke-WebRequest` 额外头破坏签名）。

### 2.3 文档

- `docs/HANDOFF-M2.md` §5 验收项已全部勾选。

- `README.md` 进展与 M2 验收命令已更新。

---

## 3. 验收清单（HANDOFF-M2 §5）

| 项 | 状态 |

|----|------|

| build + Swagger + `/v1/health` | ✅ |

| 注册 → 登录 → refresh + 错误 JSON | ✅ `m2-acceptance.ps1` |

| Profile / StrengthLevel | ✅ |

| Exercise/Food + seed | ✅ |

| sign → PUT MinIO → complete → READY | ✅（`127.0.0.1` endpoint） |

| AI 任务 + worker → DONE | ✅ |

| lint / typecheck / test | ✅（跑验收前勿占用 `packages/db/dist` 的 node 进程） |

| GitHub CI | ⬜ 待用户 push 后在 Actions 确认 |

---

## 4. 已知技术债（M3 前可选）

- Session `refreshTokenHash` 仍为占位 `'jwt-refresh'`；refresh 靠 JWT `sid` + Session 未撤销。

- 未引入 `nestjs-zod`（手写 `parseWith`）。

- 集成测试仍仅 `parse-with.spec.ts`；E2E 靠 PowerShell 脚本。

---

## 5. 关键命令（PowerShell，仓库根）

```powershell

docker compose -f docker/docker-compose.yml up -d

pnpm --filter @fitness/shared build

pnpm --filter @fitness/db build

pnpm --filter db migrate:deploy

pnpm --filter db seed



pnpm --filter api build

# 终端 1（建议先 worker）

pnpm --filter api start:worker

# 终端 2

pnpm --filter api start:api



.\scripts\m2-acceptance.ps1

```

- API：`http://127.0.0.1:3000/v1/health`

- Swagger：`http://127.0.0.1:3000/swagger`

---

## 6. Git

- M2 代码仍可能大量未提交；**勿提交 `.env`**。用户未要求前不要代 commit。

---

_交接更新：2026-05-19 · M2 收尾验收完成_
