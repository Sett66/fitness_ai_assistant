# Fitness AI Assistant · 架构说明

> 配合 `PRD.md` 阅读。本文档说明**技术栈选型理由**、**系统拓扑**、**Monorepo 目录结构**、**核心数据流**与**重要规范**。

---

## 1. 技术栈总览

| 层            | 选型                                   | 版本基线（截至 2026-05）             |
| ------------- | -------------------------------------- | ------------------------------------ |
| **包管理**    | pnpm + workspace                       | pnpm ≥ 9                             |
| **构建编排**  | Turborepo                              | turbo ≥ 2                            |
| **语言**      | TypeScript                             | TS ≥ 5.5（strict）                   |
| **校验**      | Zod                                    | zod ≥ 3.23                           |
| **Mobile**    | React Native（裸）                     | RN ≥ 0.76（New Architecture 默认开） |
|               | NativeWind                             | nativewind ≥ 4                       |
|               | react-native-reusables (rn-primitives) | latest                               |
|               | TanStack Query                         | ≥ 5                                  |
|               | Zustand                                | ≥ 4                                  |
|               | react-native-mmkv                      | ≥ 3                                  |
|               | react-native-keychain                  | latest                               |
|               | React Navigation                       | ≥ 7                                  |
|               | react-hook-form + zod resolver         | latest                               |
|               | Sentry RN                              | latest（Free tier）                  |
| **Backend**   | NestJS                                 | ≥ 10                                 |
|               | Prisma                                 | ≥ 5.18                               |
|               | PostgreSQL                             | ≥ 16                                 |
|               | BullMQ                                 | ≥ 5                                  |
|               | Redis                                  | ≥ 7                                  |
|               | nestjs-zod                             | latest                               |
|               | @nestjs/swagger                        | latest                               |
|               | pino + nestjs-pino                     | latest                               |
|               | argon2                                 | latest                               |
|               | passport-local + passport-jwt          | latest                               |
| **AI**        | LangChain.js                           | ≥ 0.3                                |
|               | LangGraph.js                           | latest                               |
|               | DeepSeek-V3.2 API（计划/分析）         | 官方 OpenAI 兼容                     |
|               | Qwen-VL-Max（图像）                    | DashScope SDK                        |
| **存储/分发** | MinIO（本地）→ 抽象 StorageProvider    | latest                               |
| **DevOps**    | Docker Compose（pg/redis/minio）       | latest                               |
|               | GitHub Actions                         | —                                    |
|               | Husky + lint-staged + commitlint       | latest                               |

---

## 2. 系统拓扑

```
┌─────────────────────────────────────────────────────────────┐
│                       Mobile (RN Android)                    │
│  TanStack Query · Zustand · MMKV · Keychain · NativeWind     │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTPS / WSS（JSON / multipart 走预签名）
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                  apps/api · NestJS Modular Monolith          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │  main.ts     │  │ worker.ts    │  │  schedule.ts     │    │
│  │  HTTP Server │  │ BullMQ       │  │  (cron, 可选)    │    │
│  │ /v1/* + Swagger│ Consumers    │  │                  │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────────┘    │
│         │ same Nest modules, different bootstraps            │
└─────────┼──────────────────┼──────────────────┼──────────────┘
          │                  │                  │
          ▼                  ▼                  ▼
   ┌──────────┐       ┌───────────┐      ┌──────────────┐
   │ Postgres │       │   Redis   │      │    MinIO     │
   │ (Prisma) │       │ (BullMQ + │      │ (S3 兼容)    │
   │          │       │   cache)  │      │  presigned   │
   └──────────┘       └───────────┘      └──────────────┘
                              │
                              │ jobs trigger
                              ▼
                  ┌────────────────────────┐
                  │   packages/ai-core     │
                  │ LangChain · LangGraph  │
                  │   ┌────────────────┐   │
                  │   │ plan-generator │   │ ← DeepSeek-V3.2
                  │   │ meal-vision    │   │ ← Qwen-VL-Max
                  │   │ report-analyzer│   │ (Phase 2)
                  │   └────────────────┘   │
                  └────────────────────────┘
```

### 进程模型

`apps/api` 是**单一 NestJS codebase，三个启动入口**：

| 入口              | 命令                             | 职责                                             |
| ----------------- | -------------------------------- | ------------------------------------------------ |
| `src/main.ts`     | `pnpm --filter api start:api`    | HTTP 服务，监听 3000                             |
| `src/worker.ts`   | `pnpm --filter api start:worker` | 不开 HTTP，注册 BullMQ Processor 消费队列        |
| `src/schedule.ts` | `pnpm --filter api start:cron`   | 注册 `@nestjs/schedule` 任务（mesocycle 复盘等） |

三者共享所有 `*.module.ts`、Prisma client、ai-core 包。开发期可三个 terminal 各跑一个。

---

## 3. Monorepo 目录结构

```
fitness-ai-assistant/
├── apps/
│   ├── mobile/                          # bare React Native（Android 优先）
│   │   ├── android/                     # 原生 Android 工程
│   │   ├── ios/                         # 保留代码兼容，不构建
│   │   ├── src/
│   │   │   ├── app/                     # 入口 + 全局 Provider 装配
│   │   │   │   ├── App.tsx
│   │   │   │   ├── providers.tsx
│   │   │   │   └── navigation/          # React Navigation root/stacks/tabs
│   │   │   ├── features/                # feature-based 业务模块
│   │   │   │   ├── auth/
│   │   │   │   ├── profile/
│   │   │   │   ├── workout/             # 打卡 + 计时器
│   │   │   │   ├── plan/                # 训练 + 饮食计划
│   │   │   │   ├── nutrition/           # 食物识别 + 饮食日志
│   │   │   │   ├── dashboard/
│   │   │   │   └── (phase2)/            # social / report，占位
│   │   │   ├── api/                     # fetch wrapper + TanStack Query hooks
│   │   │   │   ├── client.ts            # ofetch 实例 + 401 自动 refresh
│   │   │   │   ├── endpoints/           # 按 domain 拆，每文件一组 hooks
│   │   │   │   └── queryKeys.ts
│   │   │   ├── store/                   # Zustand stores（auth / ui / draft 等）
│   │   │   ├── storage/                 # MMKV + Keychain 封装
│   │   │   ├── theme/                   # NativeWind theme tokens、dark/light
│   │   │   ├── lib/                     # 工具函数
│   │   │   └── i18n/                    # 当前仅引 packages/shared 中文
│   │   ├── app.json
│   │   ├── babel.config.js
│   │   ├── metro.config.js
│   │   ├── tailwind.config.js
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── api/                             # NestJS 后端（HTTP + Worker + Cron）
│       ├── src/
│       │   ├── main.ts                  # HTTP 入口
│       │   ├── worker.ts                # BullMQ worker 入口
│       │   ├── schedule.ts              # cron 入口
│       │   ├── app.module.ts            # 根模块
│       │   ├── common/                  # 拦截器/管道/装饰器/异常过滤器
│       │   │   ├── filters/
│       │   │   ├── interceptors/
│       │   │   ├── decorators/
│       │   │   ├── pipes/               # ZodValidationPipe
│       │   │   └── guards/              # JwtAuthGuard / RolesGuard
│       │   ├── config/                  # @nestjs/config schema + 校验
│       │   ├── infra/                   # 跨切关注点
│       │   │   ├── prisma/              # PrismaService（包装 packages/db）
│       │   │   ├── queue/               # BullMQ 注册 + 队列名常量
│       │   │   ├── storage/             # StorageProvider 接口 + Minio 实现
│       │   │   ├── logger/              # pino 配置
│       │   │   └── llm/                 # LLMProvider 接口（适配 ai-core）
│       │   ├── modules/                 # 业务模块（每模块: controller/service/dto）
│       │   │   ├── auth/                # 注册/登录/refresh/Session 管理
│       │   │   ├── users/               # 个人档案 / 身体数据
│       │   │   ├── exercises/           # 动作库（含 user-defined）
│       │   │   ├── foods/               # 食物库
│       │   │   ├── workouts/            # 打卡 + 计划执行记录
│       │   │   ├── plans/               # 训练计划 + 饮食计划
│       │   │   ├── nutrition/           # 饮食日志 + 食物识别接入
│       │   │   ├── media/               # /uploads/sign + /uploads/complete
│       │   │   ├── ai-tasks/            # 任务投递 + 状态查询 + ai_runs
│       │   │   ├── dashboard/           # 聚合查询
│       │   │   ├── (social)/            # Phase 2 预留：feed/posts/comments
│       │   │   └── (reports)/           # Phase 2 预留：体检报告
│       │   └── workers/                 # BullMQ Processors（worker.ts 注册）
│       │       ├── plan-generator.processor.ts
│       │       ├── meal-vision.processor.ts
│       │       └── (report-analyzer.processor.ts)  # Phase 2
│       ├── test/
│       ├── nest-cli.json
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── shared/                          # 端到端共享（Zod / 类型 / 常量 / 文案）
│   │   ├── src/
│   │   │   ├── schemas/                 # Zod 定义，按 domain 拆文件
│   │   │   │   ├── user.ts
│   │   │   │   ├── workout.ts
│   │   │   │   ├── plan.ts
│   │   │   │   ├── nutrition.ts
│   │   │   │   ├── media.ts
│   │   │   │   ├── ai-task.ts
│   │   │   │   └── index.ts
│   │   │   ├── enums/                   # Goal/Gender/MesocycleType 等
│   │   │   ├── constants/               # 宏量比例缺省、TDEE 系数等
│   │   │   ├── errors/                  # ErrorCode 与统一错误形状
│   │   │   ├── i18n/
│   │   │   │   └── zh-CN.ts             # 业务字符串集中表
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── ui/                              # RN 通用组件（reusables 落地）
│   │   ├── src/
│   │   │   ├── primitives/              # Button/Text/Input/Sheet/Dialog ...
│   │   │   ├── components/              # 组合型组件（StatCard/ProgressRing ...）
│   │   │   ├── hooks/                   # useTheme/useColorScheme
│   │   │   ├── icons/                   # lucide-react-native 集中导出
│   │   │   ├── theme.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── ai-core/                         # LangChain / LangGraph workflows
│   │   ├── src/
│   │   │   ├── llm/                     # 模型客户端适配
│   │   │   │   ├── deepseek.ts          # OpenAI-compatible 客户端
│   │   │   │   ├── qwen-vl.ts           # DashScope SDK 适配
│   │   │   │   └── factory.ts           # model name → client
│   │   │   ├── prompts/                 # 集中 Prompt 模板（PromptTemplate）
│   │   │   ├── graphs/                  # LangGraph 状态机
│   │   │   │   ├── plan-generator/      # 评估→训练→饮食→校验→retry
│   │   │   │   └── (report-analyzer)/   # Phase 2
│   │   │   ├── chains/                  # 单步 LangChain Chain
│   │   │   │   └── meal-vision/         # 图片→JSON
│   │   │   ├── parsers/                 # Zod 输出解析 + 重试
│   │   │   ├── memory/                  # 会话/状态持久化 hook（接 Postgres）
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── db/                              # Prisma schema + seed + client 导出
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts                  # 动作库 + 食物库 seed
│   │   ├── src/
│   │   │   ├── client.ts                # 单例 PrismaClient + extension（软删除等）
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── config/                          # 共享开发配置
│       ├── tsconfig.base.json
│       ├── tsconfig.react-native.json
│       ├── tsconfig.node.json
│       ├── eslint.base.cjs
│       ├── prettier.config.cjs
│       └── package.json
│
├── docker/
│   ├── docker-compose.yml               # postgres + redis + minio
│   ├── minio/                           # 初始化脚本（建 bucket）
│   └── postgres/
│
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── DEV_SETUP.md                     # 开发环境步骤详解（后补）
│   ├── AI_PROMPTS.md                    # Prompt 设计与版本演化（后补）
│   └── adr/                             # Architecture Decision Records
│       ├── 0001-monorepo-layout.md
│       ├── 0002-rest-zod-contract.md
│       ├── 0003-modular-monolith-with-worker.md
│       └── 0004-presigned-upload.md
│
├── scripts/
│   ├── dev.ps1                          # Windows: 一键启动后端 + 数据库
│   ├── reset-db.ps1
│   └── gen-types.ps1                    # 触发 prisma generate 等
│
├── .github/
│   └── workflows/
│       ├── ci.yml                       # lint + typecheck + test（PR 必跑）
│       └── android.yml                  # tag 触发，打 APK 工件
│
├── .gitignore
├── .gitattributes
├── .editorconfig
├── .nvmrc                               # node 22 LTS
├── .npmrc
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
├── tsconfig.base.json
└── README.md
```

---

## 4. 关键数据模型（Prisma 草案）

> 仅列核心实体，详细字段在 `packages/db/prisma/schema.prisma` 落地。`?` 表示可空，`@encrypted` 是 Phase 2 装饰器占位。

```
User                  (id, phone[unique], passwordHash, role, createdAt, deletedAt?)
Profile               (userId[unique], gender, birthDate, heightCm, weightKg, trainingYears, goal)
StrengthLevel         (userId, exercise, oneRM, recordedAt)
Session               (id, userId, refreshTokenHash, deviceLabel?, expiresAt, revokedAt?)

Exercise              (id, nameZh, nameEn?, primaryMuscle, secondaryMuscles[], equipment, difficulty, isPreset, ownerUserId?, mediaUrl?)
Food                  (id, nameZh, nameEn?, per100g {kcal, protein, carbs, fat, fiber?, sodium?}, source: enum[OFFICIAL|USER|AI_ESTIMATE], ownerUserId?)

Plan                  (id, userId, type: enum[WORKOUT|MEAL], mesocycleWeeks=4, startDate, endDate, status, aiRunId?, createdAt)
WorkoutPlanDay        (planId, weekIdx, dayIdx, title, restDay: bool)
WorkoutPlanItem       (workoutPlanDayId, exerciseId, plannedSets, plannedReps, plannedWeightKg?, plannedRestSec, notes?)
MealPlanDay           (planId, weekIdx, dayIdx, totalKcal, macros{p,c,f})
MealPlanItem          (mealPlanDayId, meal: enum[BREAKFAST|LUNCH|DINNER|SNACK], dishName, ingredients[FoodEntry], cookingMethod, kcal, macros)

WorkoutSession        (id, userId, plannedDayId?, performedAt, durationSec?, mood?, note?)
WorkoutSet            (sessionId, exerciseId, setIdx, actualReps, actualWeightKg, rir?, isCompleted)

MealLog               (id, userId, takenAt, mealType, source: enum[MANUAL|VISION], imageMediaId?, totalKcal, macros)
MealLogItem           (mealLogId, foodId?, dishName, grams, kcal, macros, sourceTag: enum[OFFICIAL|USER|AI_ESTIMATE])

Media                 (id, ownerUserId, objectKey, mime, sizeBytes, status: enum[PENDING|READY|DELETED], createdAt)

AiRun                 (id, userId, taskType, model, status, inputJson, outputJson?, errorMsg?, tokenIn, tokenOut, costCNY, durationMs, createdAt)

// Phase 2 预留（schema 创建，不开放 API）
Post                  (id, userId, body, mediaIds[], visibility, createdAt, deletedAt?)
Comment               (id, postId, userId, body, parentId?, createdAt)
Reaction              (postId, userId, kind: enum[LIKE|FIRE|...], PRIMARY KEY (postId, userId))
PartnerProfile        (userId[unique], city, lng, lat, goal, level, bio)
```

---

## 5. AI 任务执行流程（异步标准链路）

以"生成训练 + 饮食计划"为例：

```
[Mobile]                  [api · HTTP]              [Redis / BullMQ]         [api · Worker]
   │                          │                          │                          │
   │ POST /v1/plans/generate  │                          │                          │
   │ {goal, weeks, …}         │                          │                          │
   ├─────────────────────────►│                          │                          │
   │                          │ INSERT AiRun status=QUEUED                          │
   │                          │ queue.add('plan.generate', {aiRunId})               │
   │                          ├─────────────────────────►│                          │
   │ 202 Accepted {taskId}    │                          │                          │
   │◄─────────────────────────┤                          │                          │
   │                          │                          │  consume('plan.generate')│
   │                          │                          ├─────────────────────────►│
   │                          │                          │                          │ LangGraph
   │                          │                          │                          │ → DeepSeek
   │                          │                          │                          │ → Zod parse
   │                          │                          │                          │ → 写 Plan / WorkoutPlanDay / …
   │                          │                          │                          │ → UPDATE AiRun status=DONE
   │                          │                          │  ack                     │
   │                          │                          │◄─────────────────────────┤
   │ GET /v1/ai/tasks/:taskId │                          │                          │
   ├─────────────────────────►│ SELECT AiRun WHERE id=…                             │
   │ {status:'DONE', result}  │                          │                          │
   │◄─────────────────────────┤                          │                          │
```

要点：

- HTTP **永远不**直接等 LLM
- 每个 AI 任务有唯一 `aiRunId`，作为后端追踪 + 客户端查询 key
- worker 抛错时按指数退避重试（最多 3 次），最终失败标 `FAILED` 并保留 `errorMsg`
- 客户端轮询频率：1s / 2s / 4s / 8s，封顶 8s

---

## 6. 上传链路（presigned）

```
[Mobile]                          [api]                       [MinIO]
   │                                │                           │
   │ POST /v1/uploads/sign          │                           │
   │ {mime, sizeBytes, scope}       │                           │
   ├───────────────────────────────►│                           │
   │                                │ 校验配额 / mime / 大小     │
   │                                │ 生成 objectKey + presign  │
   │ 200 {uploadUrl, objectKey}     │                           │
   │◄───────────────────────────────┤                           │
   │ PUT uploadUrl (binary)         │                           │
   ├────────────────────────────────┼──────────────────────────►│
   │                                │                           │
   │ POST /v1/uploads/complete      │                           │
   │ {objectKey}                    │                           │
   ├───────────────────────────────►│                           │
   │                                │ HEAD object 校验存在       │
   │                                │ INSERT Media status=READY │
   │ 201 {mediaId}                  │                           │
   │◄───────────────────────────────┤                           │
```

`StorageProvider` 接口：

```
interface StorageProvider {
  presignPut(input: { objectKey: string; mime: string; expiresSec: number }): Promise<string>;
  presignGet(input: { objectKey: string; expiresSec: number }): Promise<string>;
  head(objectKey: string): Promise<{ exists: boolean; sizeBytes?: number }>;
  delete(objectKey: string): Promise<void>;
}
```

MinIO 实现走 `@aws-sdk/client-s3 + @aws-sdk/s3-request-presigner`，未来换阿里云 OSS 时只换实现。

---

## 7. 鉴权链路

- **注册**：手机号 + 密码 → argon2 → 持久化 User
- **登录**：手机号 + 密码 → 验密码 → 颁 accessToken(15min) + refreshToken(30d，DB Session 表存 hash)
- **刷新**：客户端 access 401 → 用 refresh 走 `POST /v1/auth/refresh` → 颁新 access（refresh 滑动续期可选）
- **登出**：撤销该 Session 行
- **Mobile 存储**：accessToken in-memory（Zustand），refreshToken 进 Keychain
- **OAuth 预留**：`OAuthProvider` 接口（`exchange(code) → {externalId, profile}`），微信/QQ 各一份实现，留到 Phase 3

---

## 8. 设计与编码规范

### 8.1 TypeScript

- `strict: true`，`noUncheckedIndexedAccess: true`
- 严禁 `any`；不得不用时显式 `unknown` + 缩窄
- 所有跨端类型从 `packages/shared` 的 Zod schema `infer` 出，**禁止**两边手写同名 interface

### 8.2 错误处理

- 后端统一异常过滤器，响应形如：
  ```
  { "code": "AUTH_INVALID_CREDENTIALS", "message": "手机号或密码错误", "details": {} }
  ```
- 业务异常继承 `BizException(code, message, status)`
- 客户端 `ofetch` 拦截响应：401 触发 refresh，4xx 抛 `BizError`，5xx 抛 `ServerError`

### 8.3 命名

- 文件：kebab-case
- 类：PascalCase
- 变量/函数：camelCase
- DB 字段：camelCase（Prisma 默认）
- 枚举值：UPPER_SNAKE
- 路由：`/v1/{resource}`，复数

### 8.4 Git

- 主分支：`main`（受保护）
- 功能分支：`feat/<scope>`、`fix/<scope>`、`chore/<scope>`、`docs/<scope>`
- 提交：[Conventional Commits](https://www.conventionalcommits.org/)，commitlint 强制
- PR：必须过 CI（lint / typecheck / test），review 后 squash merge

### 8.5 ADR

每个重大架构决策写一个 `docs/adr/NNNN-xxx.md`。已规划：

1. monorepo 布局
2. REST + Zod 契约
3. 模块化单体 + worker 拆进程
4. presigned 上传
   后续每加一项重大决策（如引入 pgvector / Phase 2 社区拆服务）新增一份。

---

## 9. Phase 2 / Phase 3 演进路径

| 触发条件           | 演进动作                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------- |
| DAU > 100          | 把 worker 拆成独立部署单元（同 codebase，`apps/api` 分两个容器）                             |
| AI 调用 > 1k/天    | 加 LangSmith / 自建 trace UI，prompt 改为 prompt-version 管理                                |
| 食物识别准确率瓶颈 | 沉淀用户纠正样本 → 训练自有视觉模型 → 走 ONNX Runtime 端侧（可选）                           |
| 社区上线           | 启用 `(social)` 模块 + 简单内容审核（关键词 + LLM 兜底）                                     |
| 体检报告上线       | 启用 `(reports)` 模块 + OCR（Tesseract.js 或 paddle-ocr 服务） + 风险评估 graph              |
| 出海需要           | 实现 `LLMProvider` OpenAI/Anthropic 版本、`StorageProvider` S3 版本、`PushProvider` FCM 版本 |
