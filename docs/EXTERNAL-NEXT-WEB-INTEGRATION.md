# 外部 Next.js Web 项目 · Fitness Nest API 集成规范

> **受众**：在**独立仓库**中新建 Next.js 应用的实现 agent（**不要**在 `fitness` monorepo 内创建 `apps/web`）。
>
> **目标**：该 Web 项目仅作为 HTTP 客户端，复用本仓库 `apps/api` 提供的 REST API；行为与契约与现有 `apps/mobile` 对齐。
>
> **后端仓库路径（供联调）**：`E:/fitness`（或克隆后的等价路径）。默认 API：`http://127.0.0.1:3000/v1`。

---

## 0. Agent 任务清单（Done 定义）

完成外部 Next 项目时，至少满足：

- [ ] 所有 API 请求发往 `{API_BASE_URL}`，且 **`API_BASE_URL` 必须以 `/v1` 结尾**（无尾斜杠）。
- [ ] 使用 **`@fitness/shared` 的 Zod schema** 校验请求/响应（见 §2），禁止手写与后端重复的 interface。
- [ ] 实现 **`apiFetch`**：JSON、`Authorization: Bearer`、401 自动 refresh 重试（见 §4，可对齐 `apps/mobile/src/api/client.ts`）。
- [ ] 错误统一解析为 `{ code, message, details? }`（见 §5）。
- [ ] 登录/注册后持久化 `accessToken` + `refreshToken`，受保护路由带 Bearer。
- [ ] 浏览器上传走 **sign → PUT 预签名 URL → complete**（见 §8）；开发环境按需传 `clientPublicEndpoint`。
- [ ] AI 异步任务：**POST `/ai/tasks` → 轮询 GET `/ai/tasks/:taskId`** 直至 `DONE`/`FAILED`（见 §9）。
- [ ] 本地可对照后端 Swagger：`http://127.0.0.1:3000/swagger`（仅 `NODE_ENV !== production`）。
- [ ] **不要修改** `fitness` 仓库的 `apps/api` 除非产品方明确要求；缺接口先用 Swagger 确认，再提需求。

---

## 1. 架构关系

```text
┌─────────────────────┐         HTTPS/HTTP JSON          ┌──────────────────────┐
│  你的 Next.js 仓库   │  ──────────────────────────────► │  fitness/apps/api    │
│  (独立，非 monorepo) │   /v1/*  Bearer JWT  无 Cookie   │  NestJS + Prisma     │
└─────────────────────┘                                  └──────────┬───────────┘
                                                                    │
                    ┌───────────────────────────────────────────────┤
                    ▼                                               ▼
              PostgreSQL                                      Redis + MinIO(S3)
              (DATABASE_URL)                                    (媒体预签名)
```

- API **不是** Next API Route 的一部分；Next 只是客户端（可选 BFF，见 §10）。
- 鉴权为 **JWT Bearer**，后端**不会** Set-Cookie Session。
- 成功响应 **无** 统一 `{ data: T }` 包装，body 即资源 JSON。

---

## 2. 类型与契约：`@fitness/shared`（必须）

后端所有 HTTP body 校验使用 `packages/shared` 中的 Zod schema。外部 Web **必须**依赖同一包，避免字段漂移。

### 2.1 推荐：pnpm `file:` 依赖（与 monorepo 同机开发）

在你的 Next 项目 `package.json`：

```json
{
  "dependencies": {
    "@fitness/shared": "file:../fitness/packages/shared",
    "zod": "~3.23.8"
  }
}
```

路径按实际相对位置调整。首次联调前在 fitness 仓库构建 shared：

```bash
cd /path/to/fitness
pnpm install
pnpm --filter @fitness/shared build
```

Next 项目中：

```ts
import {
  LoginRequestSchema,
  AuthSuccessResponseSchema,
  TokenPairSchema,
  RefreshRequestSchema,
  ApiErrorSchema,
} from '@fitness/shared';
```

### 2.2 备选（无法 file 依赖时）

1. **OpenAPI**：后端开发环境 `GET http://127.0.0.1:3000/swagger-json`，用 `openapi-typescript` 生成类型（仍建议对关键路径用 Zod 再校验一层）。
2. **禁止**：复制粘贴 schema 到 Next 后长期不同步；若必须复制，需在文档中标注版本/commit。

### 2.3 核心 schema 索引（实现时按需 import）

| 用途           | Schema（`@fitness/shared`）                                               |
| -------------- | ------------------------------------------------------------------------- |
| 注册           | `RegisterRequestSchema`（= `CreateUserSchema`）                           |
| 登录           | `LoginRequestSchema`                                                      |
| 登录/注册响应  | `AuthSuccessResponseSchema`                                               |
| 刷新/登出 body | `RefreshRequestSchema`                                                    |
| 刷新响应       | `TokenPairSchema`                                                         |
| 当前用户       | `MeUserResponseSchema`、`UpdateMeSchema`                                  |
| 档案           | `ProfileResponseSchema`、`UpsertProfileSchema` 等（见 `schemas/user.ts`） |
| 分页列表       | `paginatedSchema(ItemSchema)` → `{ items, nextCursor }`                   |
| 错误体         | `ApiErrorSchema`                                                          |
| 上传 sign      | `PresignUploadRequestSchema`、`PresignUploadResponseSchema`               |
| 上传完成       | `CompleteUploadRequestSchema`、`CompleteUploadResponseSchema`             |
| AI 投递        | `CreateAiRunSchema`、`AiTaskAcceptedResponseSchema`                       |
| AI 状态        | `AiTaskStatusResponseSchema`                                              |

跨端类型规则（ARCH §8.1）：**只用 `z.infer<typeof XxxSchema>`，不要另写同名 interface。**

---

## 3. 环境与启动后端

### 3.1 启动 Fitness API（联调）

在 fitness 仓库根目录（需 Docker：Postgres、Redis、MinIO，见仓库 `README.md`）：

```bash
pnpm install
# 配置根目录 .env（可从 .env.example 复制）
pnpm --filter @fitness/api dev
```

默认监听 **`http://127.0.0.1:3000`**，业务前缀 **`/v1`**。

Worker（AI 任务）需另进程，否则 AI 会一直 `QUEUED`：

```bash
pnpm --filter @fitness/api dev:worker
```

### 3.2 Next 项目环境变量

```env
# 必须以 /v1 结尾，无尾斜杠
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000/v1

# 开发期：浏览器能访问的 MinIO 地址（预签名 PUT 用，见 §8）
# 本机 Next 与 API 同机时一般为：
NEXT_PUBLIC_STORAGE_PUBLIC_ENDPOINT=http://127.0.0.1:9000

# 客户端时区偏移（分钟），与 mobile 一致，用于按「本地日」聚合营养数据
NEXT_PUBLIC_TIMEZONE_OFFSET_MINUTES=480
```

生产部署时改为真实 API 与对象存储公网地址；生产环境 API **忽略** `clientPublicEndpoint`（仅 development 生效）。

---

## 4. HTTP 客户端约定（`apiFetch`）

**参考实现（照抄逻辑，语言改为浏览器/React）：**  
`fitness/apps/mobile/src/api/client.ts`

### 4.1 请求规则

| 项      | 约定                                                                    |
| ------- | ----------------------------------------------------------------------- |
| URL     | `` `${API_BASE_URL}${path}` ``，`path` 以 `/` 开头，如 `/users/me`      |
| Method  | 默认 `GET`；写操作用 `POST`/`PUT`/`PATCH`/`DELETE`                      |
| Headers | `Accept: application/json`；有 body 时 `Content-Type: application/json` |
| 鉴权    | 默认 `auth: true` → `Authorization: Bearer ${accessToken}`              |
| Body    | `JSON.stringify(schema.parse(body))`                                    |
| 204     | 视为 `void`，不解析 JSON                                                |

### 4.2 401 与 Token 刷新

1. 受保护请求返回 **401** → `POST /auth/refresh`，body：`RefreshRequestSchema.parse({ refreshToken })`。
2. 成功：解析 `TokenPairSchema`，更新本地 tokens，**重试原请求一次**。
3. 刷新失败：清空登录态，跳转登录页。
4. 并发 401：全局单例 `refreshPromise`，避免 refresh 风暴（见 mobile `ensureRefreshed`）。

常量（`@fitness/shared`）：

- `ACCESS_TOKEN_TTL_SEC` = 900（15 分钟）
- `REFRESH_TOKEN_TTL_SEC` = 30 天

### 4.3 公开路由（`auth: false`）

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /health`
- `GET /`（根元数据）

其余路由默认需 Bearer（后端全局 `JwtAuthGuard`）。

### 4.4 鉴权 API 示例

**注册 / 登录** — 响应 `AuthSuccessResponseSchema`：

```json
{
  "user": { "id": "...", "phone": "13800138000", "role": "USER", ... },
  "tokens": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "expiresInSec": 900
  }
}
```

**刷新** — 响应仅 `TokenPairSchema`（无 `user`）。

**登出** — `POST /auth/logout`，body `{ "refreshToken": "..." }`；客户端清 token。

### 4.5 密码与手机号（提交前客户端也应校验）

与 `RegisterRequestSchema` / `LoginRequestSchema` 一致：

- 手机：`^1[3-9]\d{9}$`
- 密码：8–64 位，至少 1 字母 + 1 数字

---

## 5. 错误响应

全局过滤器统一格式（**不是** Nest 默认 `{ statusCode, message: [] }`）：

```json
{
  "code": "AUTH_INVALID_CREDENTIALS",
  "message": "手机号或密码错误",
  "details": {}
}
```

实现建议：

```ts
class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

失败时用 `ApiErrorSchema.safeParse(await res.json())` 校验；用 `code` 做 UI 分支。

### 5.1 错误码列表（完整）

```
INTERNAL_ERROR, VALIDATION_FAILED, NOT_FOUND, FORBIDDEN, UNAUTHORIZED, RATE_LIMITED,
AUTH_INVALID_CREDENTIALS, AUTH_TOKEN_EXPIRED, AUTH_TOKEN_INVALID, AUTH_REFRESH_REVOKED, AUTH_REGISTER_PHONE_TAKEN,
USER_NOT_FOUND, PROFILE_INCOMPLETE,
MEDIA_NOT_FOUND, MEDIA_UPLOAD_FAILED, MEDIA_TOO_LARGE, MEDIA_MIME_REJECTED,
AI_TASK_NOT_FOUND, AI_TASK_LIMIT_EXCEEDED, AI_TASK_PARSE_FAILED,
PLAN_NOT_FOUND, PLAN_IN_PROGRESS, WORKOUT_NOT_FOUND
```

中文文案可参考 `@fitness/shared` 的 `errorMessagesZhCN`（可选用于 toast）。

---

## 6. CORS

后端（`apps/api/src/main.ts`）：

```ts
app.enableCors({ origin: true, credentials: true });
```

浏览器**直连** API 时，开发环境通常可用。生产建议在 API 侧将 `origin` 限制为你的 Web 域名（属 fitness 仓库部署变更，非 Next 单方完成）。

当前鉴权不依赖 Cookie，`fetch` 默认 **不必** `credentials: 'include'`。

---

## 7. HTTP 路由表（`/v1` 下）

除注明 `@Public` 外，均需 `Authorization: Bearer <accessToken>`。

### 7.1 Meta（公开）

| Method | Path      | 说明                                             |
| ------ | --------- | ------------------------------------------------ |
| GET    | `/health` | `{ "ok": true }`                                 |
| GET    | `/`       | `{ "service": "fitness-api", "version": "..." }` |

### 7.2 Auth（公开）

| Method | Path             | Body schema             | 响应                        |
| ------ | ---------------- | ----------------------- | --------------------------- |
| POST   | `/auth/register` | `RegisterRequestSchema` | `AuthSuccessResponseSchema` |
| POST   | `/auth/login`    | `LoginRequestSchema`    | `AuthSuccessResponseSchema` |
| POST   | `/auth/refresh`  | `RefreshRequestSchema`  | `TokenPairSchema`           |
| POST   | `/auth/logout`   | `RefreshRequestSchema`  | 空/成功即可                 |

### 7.3 Users（需登录）

| Method | Path                            | 说明                           |
| ------ | ------------------------------- | ------------------------------ |
| GET    | `/users/me`                     | 当前用户（含可选 `avatarUrl`） |
| PATCH  | `/users/me`                     | `UpdateMeSchema`               |
| GET    | `/users/me/profile`             | 档案；无档案时可能 404         |
| PUT    | `/users/me/profile`             | 创建/全量更新档案              |
| PATCH  | `/users/me/profile`             | 部分更新                       |
| DELETE | `/users/me/profile`             | 删除档案                       |
| GET    | `/users/me/strength-levels`     | 力量记录列表                   |
| POST   | `/users/me/strength-levels`     | 新增                           |
| PATCH  | `/users/me/strength-levels/:id` | 更新                           |
| DELETE | `/users/me/strength-levels/:id` | 删除                           |

### 7.4 Plans & Workouts

| Method | Path                                               | 说明                                            |
| ------ | -------------------------------------------------- | ----------------------------------------------- |
| GET    | `/plans?type=WORKOUT\|MEAL`                        | 分页列表，`paginatedSchema(PlanResponseSchema)` |
| GET    | `/plans/:id`                                       | 计划详情                                        |
| PATCH  | `/plans/:planId/workout-days/:dayId/items/:itemId` | 更新训练项                                      |
| DELETE | `/plans/:id`                                       | 软删计划                                        |
| GET    | `/workouts/sessions`                               | 训练打卡列表（分页）                            |
| GET    | `/workouts/sessions/:id`                           | 单次详情                                        |
| POST   | `/workouts/sessions`                               | 创建打卡，`CreateWorkoutSessionSchema`          |

### 7.5 Meal logs & Foods

| Method            | Path                       | Query / Body                                       |
| ----------------- | -------------------------- | -------------------------------------------------- |
| GET               | `/meal-logs`               | 常用：`?date=YYYY-MM-DD&timezoneOffsetMinutes=480` |
| GET               | `/meal-logs/daily-summary` | 同上 date + timezoneOffsetMinutes                  |
| GET               | `/meal-logs/:id`           |                                                    |
| POST              | `/meal-logs`               | `CreateMealLogSchema`                              |
| DELETE            | `/meal-logs/:id`           |                                                    |
| GET               | `/foods`                   | 食物库（分页，实现见 Swagger）                     |
| GET               | `/foods/:id`               |                                                    |
| POST/PATCH/DELETE | `/foods...`                | 管理端能力，按产品需要                             |

### 7.6 Exercises

| Method            | Path             |
| ----------------- | ---------------- |
| GET               | `/exercises`     |
| GET               | `/exercises/:id` |
| POST/PATCH/DELETE | `/exercises...`  |

### 7.7 Media uploads（需登录）

| Method | Path                | 说明                                                    |
| ------ | ------------------- | ------------------------------------------------------- |
| POST   | `/uploads/sign`     | `PresignUploadRequestSchema` → `uploadUrl`, `objectKey` |
| POST   | `/uploads/complete` | `{ objectKey }` → `{ mediaId }`                         |

`scope` 枚举：`MEAL_PHOTO` | `EXERCISE_MEDIA` | `AVATAR` | `REPORT`。

### 7.8 AI tasks（需登录；依赖 worker）

| Method | Path                | 说明                                                               |
| ------ | ------------------- | ------------------------------------------------------------------ |
| POST   | `/ai/tasks`         | `CreateAiRunSchema` → `{ taskId }`                                 |
| GET    | `/ai/tasks/:taskId` | `AiTaskStatusResponseSchema`；轮询时建议 `Cache-Control: no-cache` |

**任务类型** `taskType`：`PLAN_GENERATE_WORKOUT` | `PLAN_GENERATE_MEAL` | `MEAL_VISION` | `MESOCYCLE_REVIEW` | `REPORT_ANALYZE`。

**状态** `status`：`QUEUED` | `RUNNING` | `DONE` | `FAILED` | `CANCELLED`。

**参考 model 常量**（`@fitness/shared/constants` → `LLM_MODELS`）：

- 计划生成：`deepseek-v4-pro`
- 餐照识别：`qwen-vl-max`

详细 `inputJson` 形状以 mobile 为准：

- `apps/mobile/src/api/endpoints/fitness.ts`（`useGenerateWorkoutPlan`、`useGenerateMealPlan`、`useMealVision`）

---

## 8. 浏览器文件上传

流程（与 mobile 一致，PUT 实现改为浏览器）：

```text
1. POST /v1/uploads/sign   (Bearer, PresignUploadRequestSchema)
2. PUT uploadUrl            (直接对 MinIO/S3，不经过 Nest；Content-Type = mime)
3. POST /v1/uploads/complete (Bearer, { objectKey })
```

### 8.1 浏览器 PUT 示例

```ts
async function uploadToPresignedUrl(uploadUrl: string, file: File, mime: string): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mime },
    body: file,
  });
  if (!res.ok) throw new ApiError('上传失败', res.status);
}
```

**禁止**通过 Next 代理改写 `uploadUrl` 的 host（会破坏签名）。

### 8.2 开发环境 `clientPublicEndpoint`

`PresignUploadRequestSchema` 可选字段。当 Nest 在 Docker/本机而浏览器无法访问 `S3_ENDPOINT` 内网地址时，sign 请求传入浏览器可达的 MinIO URL，例如：

```json
{
  "mime": "image/jpeg",
  "sizeBytes": 12345,
  "scope": "MEAL_PHOTO",
  "clientPublicEndpoint": "http://127.0.0.1:9000"
}
```

仅 `NODE_ENV=development` 时 API 采用该字段；生产依赖服务端 `S3_PUBLIC_ENDPOINT` 配置。

参考：`apps/mobile/src/api/endpoints/media.ts` → `presignRequestBody`。

---

## 9. AI 异步任务轮询

参考：`apps/mobile/src/api/client.ts` → `pollAiTask`。

```ts
async function pollAiTask<T>(taskId: string, intervalMs: number, timeoutMs: number): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const status = await apiFetch<unknown>(`/ai/tasks/${taskId}`, { noCache: true });
    const parsed = AiTaskStatusResponseSchema.parse(status);

    if (parsed.status === 'DONE') return parsed.result as T;
    if (parsed.status === 'FAILED' || parsed.status === 'CANCELLED') {
      throw new ApiError(parsed.errorMsg ?? 'AI 任务失败', 500, 'AI_TASK_PARSE_FAILED');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new ApiError('AI 任务超时', 408);
}
```

建议间隔/超时（可与 mobile `env` 对齐）：

- 一般任务：间隔 ~2s，超时 ~60s
- 计划生成：超时更长（mobile 使用 `AI_POLL_TIMEOUT_PLAN_MS`）

**计划生成端到端（mobile 已实现）：**

1. `POST /ai/tasks`，`taskType: PLAN_GENERATE_WORKOUT` 或 `PLAN_GENERATE_MEAL`
2. `pollAiTask` 直到 `DONE`，`result` 中通常含 `planId`
3. `GET /plans/:planId` 拉详情

---

## 10. Next.js 项目结构建议

### 10.1 推荐目录

```text
src/
  lib/
    api/
      client.ts       # apiFetch、refresh、ApiError
      poll-ai-task.ts
      upload.ts       # presign + PUT + complete
  features/
    auth/             # 登录注册；token 存储
    ...
  app/                # App Router 页面
```

### 10.2 Token 存储（二选一）

| 方案            | 说明                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------- |
| **A. 纯客户端** | `accessToken` 内存（Zustand/Context），`refreshToken` `localStorage`；实现简单，注意 XSS |
| **B. BFF**      | 浏览器只调 Next Route Handler；refresh 放 httpOnly Cookie，由服务端转发 Bearer 到 Nest   |

无论哪种，对 Nest 的契约不变：**受保护接口必须 Bearer access token**。

### 10.3 Server Components

RSC **不能**直接读客户端内存 token。需要：

- 在 **Client Component** 调 `apiFetch`，或
- 用 **BFF Route Handler** 读 Cookie 再请求 Nest。

### 10.4 数据获取库

mobile 使用 `@tanstack/react-query`；Web 建议同样使用，queryKey 按资源划分（参考 `apps/mobile/src/api/queryKeys.ts`）。

---

## 11. 与 mobile 的对照文件（实现时优先读）

| 文件                                                  | 用途                             |
| ----------------------------------------------------- | -------------------------------- |
| `apps/mobile/src/api/client.ts`                       | `apiFetch`、refresh、错误、轮询  |
| `apps/mobile/src/api/endpoints/auth.ts`               | 登录注册、profile                |
| `apps/mobile/src/api/endpoints/fitness.ts`            | 计划、餐记、AI 生成、meal vision |
| `apps/mobile/src/api/endpoints/media.ts`              | 预签名上传                       |
| `packages/shared/src/schemas/*.ts`                    | 所有 Zod 契约                    |
| `apps/api/src/main.ts`                                | 前缀 `/v1`、CORS                 |
| `apps/api/src/common/filters/api-exception.filter.ts` | 错误 JSON 形                     |
| `docs/ARCHITECTURE.md` §7–§8                          | 鉴权与规范总览                   |

---

## 12. 常见问题

**Q: 能否把 API 嵌进 Next 的 `rewrites`？**  
可以，但 path 仍需映射到 `{upstream}/v1/...`；注意不要把 `/v1` 弄丢。

**Q: 登录后接口仍 401？**  
检查 `Authorization` 前缀是否为 `Bearer `（有空格）、access 是否过期、refresh 是否成功。

**Q: AI 一直 QUEUED？**  
未启动 `dev:worker` 或 Redis 未连通。

**Q: 上传 PUT 403/签名错误？**  
`uploadUrl` 必须原样使用；检查 `clientPublicEndpoint` 与浏览器实际访问的 MinIO 一致。

**Q: 营养「今日」不对？**  
必须传 `timezoneOffsetMinutes`（与 mobile 一致，中国默认 `480`）。

---

## 13. 版本与变更

- API 版本前缀：`v1`（破坏性变更应出新前缀，当前仅 v1）。
- 契约单一事实来源：`packages/shared` + 开发环境 Swagger。
- 本仓库 **M2** 阶段；Phase 2 社交等 schema 已预留但 **HTTP 未开放**，勿假设存在。

---

## 14. 给实现 agent 的 Prompt 片段（可直接复制）

```text
你在独立仓库实现 Next.js Web，后端使用 fitness monorepo 的 Nest API（不在该 monorepo 内建 apps/web）。

必读集成规范：fitness 仓库 docs/EXTERNAL-NEXT-WEB-INTEGRATION.md

硬性要求：
1. NEXT_PUBLIC_API_BASE_URL 以 /v1 结尾
2. 依赖 @fitness/shared（file: 相对路径），所有请求/响应用 Zod parse
3. 实现 apiFetch：Bearer、401 refresh 重试、ApiError 解析 { code, message }
4. 上传：sign → PUT presigned → complete；开发传 clientPublicEndpoint
5. AI：POST /ai/tasks + 轮询；worker 需单独启动
6. 行为对齐 apps/mobile/src/api/client.ts 与 endpoints/*

不要修改 fitness/apps/api，除非规范缺失且已与产品方确认。
```

---

_文档维护：fitness 仓库 API 变更时，同步更新本节路由表与 schema 索引。_
