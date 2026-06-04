# 交接文档 · M1 阶段（Monorepo 与基础设施）

> 给下一个 agent：上一段会话已完成 **M0 架构规划**，现在需要你接手 **M1**。本文档**不重复**已有产物里的内容，只列你需要立刻知道的事。

---

## 1. 立刻读这三份文件再开工

| 路径                                        | 你需要从里面拿到什么                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| [`docs/PRD.md`](./PRD.md)                   | 功能范围、MVP 与 Phase 2 边界、业务规则、数据模型语义                             |
| [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) | 技术栈版本基线、系统拓扑、**完整 Monorepo 目录树**、Prisma 数据模型草案、编码规范 |
| [`README.md`](../README.md)                 | 环境前置、`M0–M7` Roadmap、当前进展 checklist                                     |

**没读完不要写代码**。架构上所有"为什么这么选"的理由都在里面，不要二次发明。

---

## 2. 项目硬约束（不能动）

- **环境**：用户机器为 Windows，shell 是 PowerShell（不是 bash）；没有 Mac，iOS 不构建。
- **语言习惯**：用户使用规则要求**全部用简体中文回复**。代码注释也写中文。
- **项目定位**：个人练手 demo，**不上架、不商用**。不要为商业合规、应用商店审核投入任何工作量。
- **已敲定决策共 13 条**：见 `ARCHITECTURE.md` 各章节。**不要重新提**已经定好的事（比如不要再问"用 zustand 还是 redux"）。如果对某个决策有强烈反对意见，**先在新建的 ADR 草稿里说明，再找用户确认**，不要擅自更改。

---

## 3. 当前阶段任务：M1 · Monorepo 与基础设施

### 3.1 交付清单

按下面顺序交付，每一步可以让用户 review 后再下一步：

#### 3.1.1 仓库根

- `package.json`（root，`private: true`，`packageManager: "pnpm@9.x"`）
- `pnpm-workspace.yaml`（`apps/*` + `packages/*`）
- `turbo.json`（`build / dev / lint / typecheck / test / clean` pipeline；`dev` 设 `cache: false` + `persistent: true`）
- `tsconfig.base.json`（strict + noUncheckedIndexedAccess + paths 转发到 packages/config）
- `.gitignore`（覆盖 node_modules / dist / .turbo / .env / android build / metro 缓存等）
- `.gitattributes`（行尾归一化 `* text=auto eol=lf`，避免 Windows CRLF 串味）
- `.editorconfig`
- `.nvmrc`（`22`）
- `.npmrc`（`shamefully-hoist=false`、`auto-install-peers=true`、`engine-strict=true`）
- 顶层 `git init`（确认 `git status` 干净后用户会决定是否首次 commit；**不要替用户提交 commit，除非他明确说提交**）

#### 3.1.2 `packages/config`

- `tsconfig.base.json` — 公共 strict 配置
- `tsconfig.node.json` — extends base，给 NestJS / 脚本用（`module: NodeNext`、`target: ES2022`）
- `tsconfig.react-native.json` — extends base，给 RN 用（`jsx: react-native`、`module: ESNext`、`moduleResolution: bundler`）
- `eslint.base.cjs` — flat config（ESLint 9）或 legacy `.eslintrc.cjs`（看你选哪个；推荐 **flat config**）
- `prettier.config.cjs`
- `package.json`

> ⚠️ ESLint flat config 与某些 RN 插件还有兼容性坑。如果调不通，**可以降到 legacy 配置**，但要在 ADR 里写明。

#### 3.1.3 `packages/shared`

按 `ARCHITECTURE.md` §4 数据模型把 **Zod schema 全量写出**，路径见 §3 目录树。每个 domain 文件至少导出：

- 完整实体 schema（含 `id`、`createdAt`、`deletedAt?`）
- 创建用 schema（去掉服务端字段）
- 更新用 schema（partial）
- 对外响应 schema（脱敏，比如 `User` 响应不含 `passwordHash`）

`enums/`、`constants/`、`errors/`、`i18n/zh-CN.ts` 都先建文件、放最小占位 + 注释 TODO，不必一次写满。

#### 3.1.4 `packages/db`

- `prisma/schema.prisma` 按 `ARCHITECTURE.md` §4 完整落地（含 Phase 2 占位表 Post/Comment/Reaction/PartnerProfile）
- `provider = "postgresql"`、`previewFeatures` 启用 `driverAdapters` 视需而定
- `generator client { output = "../src/generated" }`，单例 PrismaClient 走 `src/client.ts` 导出
- `prisma/seed.ts`：**先放 5 个动作 + 10 个食物的最小 seed**，剩余 50–80 / 200–300 在后续阶段补；不要现在就硬塞 300 条数据
- `package.json` script：`prisma`、`migrate:dev`、`generate`、`seed`、`studio`
- `tsconfig.json` extends `packages/config/tsconfig.node.json`

#### 3.1.5 空骨架（仅占位，等后续阶段填）

`apps/api`、`apps/mobile`、`packages/ui`、`packages/ai-core` 这四个**只建目录 + `package.json` + `tsconfig.json` + README.md** 标明 "TODO: 见 M2/M3/M4"。**不要超前实现**，避免和后续阶段冲突。

#### 3.1.6 Docker Compose

`docker/docker-compose.yml`：

- `postgres:16-alpine`（端口 5432，数据卷持久化）
- `redis:7-alpine`（端口 6379）
- `minio/minio`（API 9000，控制台 9001，启动时自动建 `media` bucket）
- 在同一 user-defined network，service 名作为 hostname
- 提供 `.env.example` 模板（数据库密码、JWT 密钥占位、AI key 占位）

#### 3.1.7 提交规范工具链

- `husky` + `lint-staged` + `commitlint`（`@commitlint/config-conventional`）
- `pre-commit`: 跑 lint-staged（ESLint + Prettier）
- `commit-msg`: 跑 commitlint
- root `package.json` 加 `prepare: husky install`

#### 3.1.8 GitHub Actions

`.github/workflows/ci.yml`：

- 触发：PR + push to main
- jobs：
  - `setup` → checkout / setup-node 22 / pnpm cache / install
  - `lint` → `pnpm lint`
  - `typecheck` → `pnpm typecheck`
  - `test` → `pnpm test`（M1 没测试时 echo 跳过）
- **不要**在 M1 阶段配 APK 打包（那是 M5 的事）

#### 3.1.9 ADR

`docs/adr/` 新建 4 份：

1. `0001-monorepo-layout.md` — 引用 ARCHITECTURE §3，记录"包划分为 apps×2 + packages×5"的决策依据
2. `0002-rest-zod-contract.md`
3. `0003-modular-monolith-with-worker.md`
4. `0004-presigned-upload.md`

模板用 [MADR](https://adr.github.io/madr/) 简版：Context / Decision / Consequences / Status。中文写就行。

### 3.2 验收标准

下面四条全部通过，M1 算完成：

1. `pnpm install` 一次跑通，无报错
2. `pnpm typecheck` 全包通过
3. `docker compose -f docker/docker-compose.yml up -d` 起来后，`pnpm --filter db migrate:dev --name init` 能成功生成第一份 migration
4. `pnpm --filter db seed` 能跑完并写入数据（最小 5+10 条）
5. 提交一个测试 commit，commitlint 能拦下不规范信息，规范信息能通过

---

## 4. 容易踩的坑（按优先级排序）

1. **PowerShell vs bash 命令不通用**。所有给用户运行的脚本要么用 `.ps1`，要么用 cross-platform 的 `cross-env` / `rimraf`。`&&` 在旧版 PowerShell 不可用，但用户用的 PS7+ 应该 OK，但**绝对不要写** `mkdir -p`、`rm -rf`、`cp` 这类 bash-ism。
2. **Prisma + pnpm hoist 冲突**：默认 `shamefully-hoist=false` 时，需要在 `apps/api` 显式依赖 `@prisma/client`。`packages/db` 用 `prisma generate --output` 把 client 输出到包内 `src/generated/` 是规避方法之一。
3. **Zod 版本**：v3 与 v4 API 有差异。**统一用 v3.23.x**（与 nestjs-zod 当前生态兼容）。
4. **MinIO bucket 自动创建**：MinIO 镜像不会自动建 bucket，需要在 compose 里加一个 init 容器跑 `mc mb` 或者在 NestJS 启动时调一次 `headBucket → createBucket`。M1 阶段在 compose 里搞定。
5. **node 22 + RN 0.76**：RN 在 Windows 上对 node 版本敏感。Metro 报错的话先看是不是 node 版本不匹配。
6. **不要安装 expo 任何包**。bare RN 路线，严禁混入 expo 依赖。
7. **不要现在就装 RN 依赖**。M1 阶段 `apps/mobile` 仅占位；RN init 是 M4 的事，提前 init 会被 metro / pod 各种缓存绊住。
8. **包间引用走 workspace 协议**：`"@fitness/shared": "workspace:*"`。命名空间统一用 `@fitness/<pkg>`。

---

## 5. 工作方式建议

- 用户偏好结构化决策。需要他拍板时，**用结构化的多选题**（你的 IDE 里应该有类似 `AskQuestion` 的能力），不要在散文里塞选项
- 每完成 §3.1 的一个子节就停下来给用户 review，**不要一口气把 M1 全 commit 了**
- **commit 决策权归用户**：你可以建议提交点，但 `git commit` 由用户触发，除非他明确说"帮我提交"
- 用户偏好你给推荐答案：每个问题都说"我推荐 X 因为 Y"
- 如果发现 PRD / ARCHITECTURE 里有矛盾或漏洞，**先写一份 ADR 草稿，再问用户**，不要直接改文档

---

## 6. 建议下一个 agent 启用的 skills

| Skill         | 何时启用                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| `create-rule` | 把"中文回复 / 不许 expo / 提交规范 / PowerShell only" 这些项目级约束沉淀进 `.cursor/rules/`，让后续会话自动遵守 |
| `tdd`         | 写 seed / shared schemas 时如果想保住可靠性可以走，但 M1 大部分是配置工作，TDD 收益一般，按需用                 |
| `babysit`     | 当 CI 接好后，PR 进 CI 失败时再用                                                                               |

不推荐立刻用 `to-issues` / `to-prd` / `split-to-prs` —— 当前项目还没 issue tracker，PRD 已有，单 commit 流就够。

---

## 7. 完成 M1 后的下一步预告（**不要现在做**）

- M2：`apps/api` 真正落地（HTTP + auth + users + media）
- M3：`packages/ai-core` 接入 DeepSeek + Qwen-VL，跑通食物识别 chain 与计划生成 graph
- M4：`apps/mobile` 用 `npx @react-native-community/cli init` 初始化（注意：要在 monorepo 里 init RN，metro/babel 配置需要额外调，到时候单开一份 ADR）

---

## 8. 一句话定义你的成功

> 用户在 Windows 终端跑 `pnpm install && docker compose up -d && pnpm --filter db migrate:dev --name init && pnpm --filter db seed`，全程零报错，看到 Prisma Studio 里有数据。
