# REPORT-01 — 图片体检报告最小闭环：上传 → VLM 抽取 → 结构化展示

| 字段           | 值                   |
| -------------- | -------------------- |
| **Type**       | AFK                  |
| **Blocked by** | ADR 0009（Accepted） |
| **Blocks**     | REPORT-02、03、06    |
| **估时**       | 3–4 天               |
| **状态**       | ✅ 已完成            |

---

## 1. 目标

打通体检报告分析的**端到端骨架**（仅图片、仅阶段 1）：用户在「我的」进入体检报告，多选图片上传，服务端建 `HealthReport` 并异步用 Qwen-VL 抽取结构化指标，客户端轮询后在详情页看到按 catalog 分类的指标表 + 免责声明。

**本切片不做**：阶段 2 风险评估（REPORT-02）、PDF（REPORT-03）、手动修正（REPORT-04）、注入计划/Coach（REPORT-05）、趋势（REPORT-06）。阶段 2 产物字段先留空。

---

## 2. 背景 / 可复用基建

- 预签名上传：`UploadScope` **已含 `REPORT`**（`packages/shared/src/schemas/media.ts`）；先 `POST /v1/uploads/sign` → PUT → `POST /v1/uploads/complete` 拿 `mediaId`
- AI 异步：`AiRun` + BullMQ；`AiTaskType.REPORT_ANALYZE` **已存在**（enum + prisma）
- 两阶段视觉先例：`packages/ai-core/src/chains/meal-vision/`
- 任务投递/轮询：`apps/api/src/modules/ai-tasks/`、`GET /v1/ai/tasks/:taskId`
- worker 注册：`apps/api/src/worker.ts` + `apps/api/src/workers/*.processor.ts`

---

## 3. 前置阅读

1. [ADR 0009](../../adr/0009-health-report-analysis.md) §1–7、§10、§11（**以 ADR 为准**）
2. `packages/db/prisma/schema.prisma`（`Media`、`AiRun`、`Post.mediaIds` 松关联范式）
3. `packages/ai-core/src/chains/meal-vision/index.ts`（VLM 调用 + Zod 解析范式）
4. `apps/api/src/modules/media/`、`apps/api/src/modules/ai-tasks/`
5. `apps/mobile/src/app/navigation/RootNavigator.tsx`、`apps/mobile/src/features/nutrition/MealVisionResultScreen.tsx`

---

## 4. 详细规格

### 4.1 DB（`packages/db/prisma/schema.prisma` + migration）

新增 `HealthReport` 模型（字段见 ADR 0009 §6）。要点：

- `status` 复用 `AiTaskStatus`（QUEUED/RUNNING/DONE/FAILED）
- `sourceMediaIds String[] @default([])`、`pageMediaIds String[] @default([])`（PDF 页图，本切片恒空）
- `metrics Json`、`riskAssessment Json?`、`healthContext String?`（后两者本切片留空）
- `aiRunId String? @unique` + relation 到 `AiRun`（仿 `Plan.aiRunId`）
- 软删 `deletedAt`；索引 `@@index([userId, createdAt])`、`@@index([deletedAt])`
- `User` 加反向关系 `healthReports HealthReport[]`

跑 `pnpm --filter db migrate:dev --name health_report`。

### 4.2 指标 catalog（`packages/shared/src/constants/health-metrics.ts`）

数据驱动目录（ADR 0009 §4）。每条：

```ts
{
  key: string;            // 规范化英文缩写，如 'LDL' 'ALT' 'TESTOSTERONE'
  nameZh: string;
  aliases: string[];      // 归一化用：['低密度脂蛋白', 'LDL-C', ...]
  unit: string;
  category: 'METABOLIC' | 'LIPID' | 'GLUCOSE' | 'LIVER' | 'KIDNEY'
          | 'HORMONE' | 'BLOOD' | 'THYROID' | 'CARDIO' | 'BODY_COMP';
  fitnessRelevant: boolean;
  refLow?: number;
  refHigh?: number;
  // criticalLow/High 由 REPORT-02 引入，本切片可先不填
}
```

初版收录 ~20 项（可增），至少覆盖：BMI、体脂率、血压（收缩/舒张）、空腹血糖、糖化血红蛋白、总胆固醇、甘油三酯、HDL、LDL、尿酸、ALT、AST、肌酐、eGFR、血红蛋白、TSH、静息心率、**睾酮、皮质醇、SHBG**。

导出：`HEALTH_METRIC_CATALOG`、`getMetricByKey(key)`、`resolveMetricKey(rawName)`（按 aliases 归一，找不到返回 undefined）。

> **验收提示**：ref 范围数值需人工过一眼（公开参考区间，注意性别差异如睾酮），代码内注释标注来源。

### 4.3 共享 Zod 契约（`packages/shared/src/schemas/health-report.ts`）

```ts
MetricFlag = z.enum(['NORMAL','HIGH','LOW','ABNORMAL'])

HealthMetricItemSchema = {
  key: z.string(),        // 运行时校验在 catalog 内
  nameZh: z.string(),
  value: z.number().or(z.string()),  // 血压等可能是字符串
  unit: z.string(),
  refLow: z.number().optional(),
  refHigh: z.number().optional(),
  flag: MetricFlag,
  edited: z.boolean().optional(),
}

HealthOtherItemSchema = { nameZh, value, unit, flag }

HealthReportMetricsSchema = {
  reportDate: DateTimeSchema.optional(),
  items: z.array(HealthMetricItemSchema),
  otherItems: z.array(HealthOtherItemSchema).default([]),
  summaryText: z.string().max(2048).optional(),
}

// HTTP
CreateHealthReportRequestSchema = { sourceMediaIds: z.array(IdSchema).min(1).max(20) }
CreateHealthReportResponseSchema = { reportId: IdSchema, taskId: IdSchema }
HealthReportListItemSchema = { id, reportDate?, status, abnormalCount, createdAt }
HealthReportDetailSchema = {
  id, status, reportDate?,
  metrics: HealthReportMetricsSchema.nullable(),
  riskAssessment: z.unknown().nullable(),      // REPORT-02 细化
  sourceImageUrls: z.array(z.string().url()),   // 预签名读 URL
  disclaimer: z.string(),
  createdAt, updatedAt,
}
```

从 `packages/shared/src/index.ts` 导出；`pnpm --filter shared build`。

### 4.4 ai-core 阶段 1 抽取（`packages/ai-core/src/chains/report-extract/`）

- `runReportExtract(input, options?)`：input `{ imageUrls: string[], catalog: {key,nameZh,aliases,unit}[] }`
- 用 `createQwenVlClient().generateJson`，messages content 内**多张 image_url**（页/图数组）+ 一段 prompt（`packages/ai-core/src/prompts/report-extract.ts`）
- prompt 要求：逐项抽取 → 按提供的 catalog aliases 归一到 key（命中填 items，未命中填 otherItems）→ 保留报告单自带参考范围 → 判 flag → 抽 reportDate
- `parseJsonWithSchema(HealthReportMetricsSchema, ...)` 校验；解析失败重试（沿用 `parsers/json-zod`）
- 返回 `{ result: metrics, usage, rawText }`

> catalog 由 API 侧从 `HEALTH_METRIC_CATALOG` 传入（ai-core 不直接依赖 shared 常量的具体内容，保持纯函数可测）。

### 4.5 API `reports` 模块（`apps/api/src/modules/reports/`）

- `POST /v1/reports`（`CreateHealthReportRequestSchema`，`parseWith`）：
  - 校验 media 归属当前用户且 `status=READY`
  - `assertDailyLimit(userId, 'REPORT_ANALYZE')`（复用 `getAiTaskDailyLimit`，见 §4.6）
  - 事务建 `HealthReport(QUEUED)` + `AiRun(REPORT_ANALYZE, inputJson={reportId})`，回填 `HealthReport.aiRunId`
  - `queue.add('default', { aiRunId })`（同 ai-tasks）
  - 返回 `{ reportId, taskId }`
- `GET /v1/reports`：当前用户、未软删、倒序，映射 `HealthReportListItemSchema`（`abnormalCount` = metrics.items 中 flag≠NORMAL 计数）
- `GET /v1/reports/:id`：详情；对 `sourceMediaIds` 用 StorageProvider 批量签发预签名读 URL 填 `sourceImageUrls`；`disclaimer` 取 i18n 文案
- 模块注册进 `app.module.ts`；controller 挂 `JwtAuthGuard`

### 4.6 配额（`packages/shared/src/constants/limits.ts`）

`AI_TASK_DAILY_LIMITS` 增 `REPORT_ANALYZE: 3`。

### 4.7 worker processor（`apps/api/src/workers/report-analyze.processor.ts`）

按 `aiRunId` 消费：

1. 读 `AiRun` + 关联 `HealthReport`；置 `RUNNING`
2. 对 `sourceMediaIds` 中的**图片**签发预签名读 URL（本切片只处理图片；PDF 留 REPORT-03）
3. 调 `runReportExtract({ imageUrls, catalog: HEALTH_METRIC_CATALOG })`
4. 回写 `HealthReport.metrics` + `reportDate`，`AiRun.outputJson/usage/status=DONE`，`HealthReport.status=DONE`
5. 失败：`AiRun.status=FAILED` + errorMsg，`HealthReport.status=FAILED`（沿用 3 次退避重试）

在 `worker.ts` 注册该 processor（与现有 plan/meal-vision processor 并列）。

> 若 `sourceMediaIds` 含非图片 mime（PDF），本切片可直接跳过或标记；REPORT-03 补齐渲染。

### 4.8 移动端

- **入口**：`ProfileScreen` 增「体检报告」行 → `navigation.navigate('ReportList')`
- **导航**：`RootStackParamList` 增 `ReportList`、`ReportUpload`、`ReportDetail: { reportId }`；注册三屏
- **`ReportUpload`**：多选图片（复用 `features/media` 相机/相册）→ 逐张预签名上传拿 mediaId → `POST /v1/reports` → 跳 `ReportDetail` 并轮询
- **`ReportList`**：`GET /v1/reports`，列表项显示体检日期/状态/异常数；顶部「上传新报告」；空态引导
- **`ReportDetail`**：轮询 status（1/2/4/8s）；分析中 loading；DONE 后渲染：原件缩略图、按 category 分组的指标表（异常 flag 高亮）、otherItems 折叠区、底部固定免责声明
- **api hooks**：`apps/mobile/src/api/endpoints/reports.ts`（TanStack Query）+ queryKeys

---

## 5. 建议改动文件

| 路径                                                 | 动作                                            |
| ---------------------------------------------------- | ----------------------------------------------- |
| `packages/db/prisma/schema.prisma`                   | 新增 `HealthReport` + User 反向关系 + migration |
| `packages/shared/src/constants/health-metrics.ts`    | 新建 catalog                                    |
| `packages/shared/src/constants/limits.ts`            | `REPORT_ANALYZE: 3`                             |
| `packages/shared/src/schemas/health-report.ts`       | 新建 Zod                                        |
| `packages/shared/src/i18n/zh-CN.ts`                  | disclaimer 等文案                               |
| `packages/shared/src/index.ts`                       | 导出                                            |
| `packages/ai-core/src/chains/report-extract/`        | 新建抽取链                                      |
| `packages/ai-core/src/prompts/report-extract.ts`     | 新建 prompt                                     |
| `packages/ai-core/src/index.ts`                      | 导出                                            |
| `apps/api/src/modules/reports/`                      | 新建 module/controller/service/dto              |
| `apps/api/src/workers/report-analyze.processor.ts`   | 新建                                            |
| `apps/api/src/worker.ts` / `app.module.ts`           | 注册                                            |
| `apps/mobile/src/features/report/`                   | 新建三屏 + 组件                                 |
| `apps/mobile/src/app/navigation/RootNavigator.tsx`   | 注册路由                                        |
| `apps/mobile/src/features/profile/ProfileScreen.tsx` | 入口行                                          |
| `apps/mobile/src/api/endpoints/reports.ts`           | hooks                                           |

---

## 6. Acceptance criteria

- [x] `pnpm --filter db migrate:dev` 生成 `HealthReport` 表，`pnpm typecheck` 全仓通过
- [x] `POST /v1/reports` 用图片 mediaIds 返回 `{ reportId, taskId }`，超 3 次/天返回 `AI_TASK_LIMIT_EXCEEDED` 429
- [x] worker 消费后 `HealthReport.metrics.items` 含 catalog 归一后的结构化指标，未命中项进 `otherItems`
- [x] `GET /v1/reports/:id` 返回预签名图片 URL、指标与免责声明
- [x] 移动端：我的 → 体检报告 → 传图 → 分析中 → 详情看到分类指标表 + 免责声明（Android 真机/模拟器）
- [x] catalog ref 范围经人工校对（含睾酮性别差异）
- [x] `report-extract` 至少 1 个 parse 单测（含未命中→otherItems 用例）

---

## 7. 验证步骤

```powershell
pnpm --filter db migrate:dev --name health_report
pnpm --filter shared build
pnpm typecheck
pnpm --filter api start:worker   # 需 DASHSCOPE_API_KEY
pnpm --filter api start:api
# 手测：mobile 传一张体检截图，观察详情页指标
```

---

## 8. 不做

- 阶段 2 风险评估 / healthContext（REPORT-02）
- PDF 渲染与选择（REPORT-03）
- 手动修正 / 重评估（REPORT-04）
- 注入计划生成 / Coach（REPORT-05）
- 趋势展示（REPORT-06）

---

## 9. 交付物 / 下游

| 交付物                                            | 消费者                                                         |
| ------------------------------------------------- | -------------------------------------------------------------- |
| `HealthReport` 模型 + `reports` 模块 + 三屏       | REPORT-02/03/04/05/06                                          |
| `HEALTH_METRIC_CATALOG` + `resolveMetricKey`      | REPORT-02（critical 阈值）、06（趋势按 key）                   |
| `report-extract` 链 + `HealthReportMetricsSchema` | REPORT-03（页图归一入同链）、04（修正 schema）                 |
| `report-analyze.processor`                        | REPORT-02（追加阶段 2）、03（前置渲染步）、04（REASSESS 分支） |
