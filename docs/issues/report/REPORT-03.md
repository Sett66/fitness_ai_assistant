# REPORT-03 — PDF 支持：服务端按页渲染 + 移动端 PDF 选择

| 字段           | 值                          |
| -------------- | --------------------------- |
| **Type**       | AFK                         |
| **Blocked by** | [REPORT-01](./REPORT-01.md) |
| **Blocks**     | —                           |
| **估时**       | 2–3 天                      |
| **状态**       | ⬜ 未开工                   |

---

## 1. 目标

支持上传 **PDF 体检报告**。由于 Qwen-VL 不能直接吃 PDF（DashScope `image_url` 仅接受图片），在 **worker 内用 `pdfjs-dist` 按页渲染为图片**、回存 MinIO，得到 `pageMediaIds`，与多图归一为「图片页数组」后走 REPORT-01 已建的抽取链。移动端接入 PDF 文件选择器。

可与 REPORT-02 并行（互不依赖，都只依赖 01）。

---

## 2. 背景

- ADR 0009 §2：PDF 服务端按页渲染，回存 MinIO（满足 >7MB 图必须走公网 URL 的硬性要求）
- REPORT-01 的 `HealthReport.pageMediaIds` 字段与 processor「PDF 判定」占位已预留
- StorageProvider 接口（ARCH §6）：`presignPut/presignGet/head/delete`

---

## 3. 前置阅读

1. [ADR 0009](../../adr/0009-health-report-analysis.md) §2、§7
2. [REPORT-01](./REPORT-01.md) §4.7（processor）、§4.5（POST /v1/reports）
3. `apps/api/src/infra/storage/`（StorageProvider + Minio 实现）
4. `apps/mobile/src/features/media/`、`apps/mobile/src/features/report/ReportUpload*`

---

## 4. 详细规格

### 4.1 worker PDF 渲染（`apps/api/src/infra/`）

- 新增依赖：`pdfjs-dist`（Node 侧渲染）+ 一个 canvas 后端（`@napi-rs/canvas` 优先，纯 prebuilt，避免 `canvas` 原生编译在 Windows 的坑）
- 新增 `PdfRenderService`（或 infra util）：`renderPdfToImages(buffer, { dpi=150, maxPages=15 }) => Buffer[]`
- 每页渲染为 PNG/JPEG buffer；限制最大页数（超出截断并记 warn）

### 4.2 processor 归一化步骤

`report-analyze.processor` 在阶段 1 之前插入：

1. 遍历 `sourceMediaIds`，按 `Media.mime` 分流：
   - 图片：直接取预签名读 URL
   - `application/pdf`：从 MinIO 下载 → `renderPdfToImages` → 每页 `presignPut` 回存 MinIO（objectKey 规范如 `reports/{reportId}/page-{n}.png`）→ 建 `Media(READY)` → 收集到 `pageMediaIds`
2. 合并「图片 URL + 页图 URL」为有序 `imageUrls` 传入 `runReportExtract`
3. 回写 `HealthReport.pageMediaIds`

> 渲染 + 回存在 worker 内完成，HTTP 进程不参与（重任务边界）。

### 4.3 上传/读取契约放宽

- `POST /v1/reports` 允许 `sourceMediaIds` 含 PDF（mime 校验放行 `application/pdf`）
- **`ReadUploadUrlsRequestSchema.objectKeys` 上限从 5 放宽**（如 30），因多页报告读 URL 会超 5（`packages/shared/src/schemas/media.ts`）
- `GET /v1/reports/:id` 的 `sourceImageUrls` 改为返回**页图**（`pageMediaIds`）优先，便于详情页逐页预览；原始 PDF 可另给下载 URL（可选）

### 4.4 移动端 PDF 选择

- 新增依赖 `react-native-document-picker`（bare RN，需 `pnpm --filter mobile android` 前完成原生链接；更新 `apps/mobile/README.md` 与 android 配置）
- `ReportUpload` 增「选择 PDF」入口：选中 → 预签名上传（scope=REPORT，mime=application/pdf）→ 拿 mediaId → 与图片一并进 `sourceMediaIds`
- 校验大小（≤ media schema 上限 50MB）与类型

---

## 5. 建议改动文件

| 路径                                               | 动作                               |
| -------------------------------------------------- | ---------------------------------- |
| `apps/api/package.json`                            | 加 `pdfjs-dist`、`@napi-rs/canvas` |
| `apps/api/src/infra/pdf/pdf-render.service.ts`     | 新建渲染                           |
| `apps/api/src/workers/report-analyze.processor.ts` | 归一化步骤 + pageMediaIds          |
| `apps/api/src/modules/reports/*`                   | mime 放行 PDF、详情返回页图        |
| `packages/shared/src/schemas/media.ts`             | objectKeys 上限放宽                |
| `apps/mobile/package.json`                         | 加 `react-native-document-picker`  |
| `apps/mobile/src/features/report/ReportUpload*`    | PDF 选择                           |
| `apps/mobile/README.md` / android 配置             | 原生依赖说明                       |

---

## 6. Acceptance criteria

- [ ] `pnpm typecheck` 全仓通过；worker 启动不因 canvas 依赖崩溃（Windows）
- [ ] 上传单个多页 PDF → worker 渲染出对应页图并回存 MinIO，`pageMediaIds` 长度 = 页数（≤maxPages）
- [ ] PDF 报告的指标抽取与图片同链路生效，详情页可逐页预览页图
- [ ] `ReadUploadUrlsRequest` 支持 >5 个 objectKey
- [ ] 移动端可选择 PDF 并成功上传分析（Android 真机）
- [ ] 超大/超页数 PDF 有截断与提示，不 OOM

---

## 7. 验证步骤

```powershell
pnpm --filter api start:worker
pnpm --filter api start:api
# 手测：mobile 选一个 2–3 页 PDF 体检报告上传，检查页图与指标
```

---

## 8. 不做

- 阶段 2 评估逻辑（REPORT-02）
- 手动修正（REPORT-04）
- 端侧 PDF 转图（明确由服务端渲染）

---

## 9. 交付物 / 下游

| 交付物                                     | 消费者                     |
| ------------------------------------------ | -------------------------- |
| `PdfRenderService` + 归一化 processor 步骤 | 后续任何需要 PDF→图 的场景 |
| PDF 选择的移动端能力                       | 报告上传流                 |
