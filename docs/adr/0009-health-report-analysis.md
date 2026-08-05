# 0009 — 体检报告分析：多模态抽取、两阶段链路与健康上下文注入

## Context

PRD §3.2 P1 规划了「体检报告 AI 分析：上传 PDF/图片 → OCR → 提取指标 → 风险评估 → 计划调整建议」。ARCHITECTURE §9 预留了 `(reports)` 模块、`report-analyzer` graph 与「OCR（Tesseract.js / paddle-ocr）+ 风险评估 graph」的演进路径。

进入 Phase 2（M6）后，先做体检报告分析（社交延后）。本 ADR 固化其架构决策，作为 `docs/issues/report/REPORT-0X.md` 各切片的共同依据。

现状可复用的基建：

- **media 预签名上传**（ADR [0004](./0004-presigned-upload.md)）：`UploadScope` 已含 `REPORT`
- **AI 异步任务链路**（ADR [0003](./0003-modular-monolith-with-worker.md)、[0005](./0005-m3-ai-context-and-execution.md)）：`AiRun` + BullMQ + 轮询；`AiTaskType.REPORT_ANALYZE` 已存在
- **两阶段视觉链路先例**：`runMealVisionWithAdvice`（Qwen-VL 识图 + DeepSeek 建议）
- **计划生成上下文注入**：`UserContextService.mergePlanGeneratorInput`
- **Coach system prompt 注入**（ADR [0008](./0008-coach-agent-tools-and-memory.md)）

## Decision

### 1. 不引入独立 OCR，统一用 VLM 多模态抽取

放弃 ARCH §9 早期设想的 Tesseract/paddle-ocr 独立服务。体检单（含表格）直接交给 **Qwen-VL-Max** 出结构化 JSON，与餐照识别同构，少一个部署组件，对表格化报告更鲁棒。

### 2. 输入形态：多图 + PDF，PDF 服务端按页渲染

- 支持一次上传**多张图片**（JPG/PNG）与 **PDF**。
- **PDF 不能直接喂 VLM**（DashScope OpenAI 兼容模式 `image_url` 仅接受图片）。在 **worker 内用 `pdfjs-dist` 按页渲染为图片**，回存 MinIO，得到 `pageMediaIds`，之后与多图归一为「图片页数组」走同一链路。
- 回存页图（而非仅内存 base64）：满足 DashScope >7MB 图片必须走公网 URL 的硬性要求，并支持前端预览/复查。

### 3. 两阶段 AI 链路（`packages/ai-core`）

| 阶段              | 模型              | 职责                                                                          | 产出                               |
| ----------------- | ----------------- | ----------------------------------------------------------------------------- | ---------------------------------- |
| **阶段 1 · 抽取** | `QWEN_VL_MAX`     | 页图 → 结构化指标；按 catalog 归一别名；未命中入 `otherItems`；带原始参考范围 | `metrics`                          |
| **阶段 2 · 评估** | `DEEPSEEK_V4_PRO` | 基于 `metrics`（纯文本）+ 用户档案 → 风险解读、健身提示、健康约束             | `riskAssessment` + `healthContext` |

阶段 2 脱离图片，可**单独重跑**（用户修正指标后仅重算阶段 2，见 §7）。低温度、Zod 校验 + 失败重试（延续 PRD §7 幻觉兜底）。

### 4. 指标采用「数据驱动 catalog」而非硬编码枚举

- **指标目录**放 `packages/shared/src/constants`，纯数据表，每条：`{ key, nameZh, aliases[], unit, category, fitnessRelevant, refLow?, refHigh?, criticalLow?, criticalHigh? }`。
- **分类（category）**：代谢 / 血脂 / 血糖 / 肝功 / 肾功 / 激素 / 血常规 / 甲功 / 心血管 / 体成分。覆盖健身人群关注项（睾酮、皮质醇、SHBG 等）+ 血脂 / 血糖 / 肝肾功能。
- **指标存 JSON**（`HealthReport.metrics`），非关系化列 → **新增指标 = 追加 catalog 数据，零 migration、不破坏历史**。
- 指标项 `key` 用 `z.string()` + 运行时校验是否在 catalog 内（非 `z.enum`），命中者可参与规则判断，未命中落 `otherItems`。
- VLM prompt 携带 catalog（key + aliases + unit）做归一化映射。

### 5. 混合结构的指标输出

```
metrics: {
  reportDate?: string,          // VLM 从单子抽取，可空
  items: [{ key, nameZh, value, unit, refLow?, refHigh?, flag, edited?: boolean }],
  otherItems: [{ nameZh, value, unit, flag }],   // 长尾，仅展示
  summaryText?: string,
}
```

- `flag`: `NORMAL | HIGH | LOW | ABNORMAL`
- `edited`: 人工校正标记（类比餐照 `AI_ESTIMATE`）

### 6. 数据模型：`HealthReport`（聚合式，指标存 JSON）

```
HealthReport(
  id, userId,
  reportDate?,
  status,                       // QUEUED | RUNNING | DONE | FAILED
  sourceMediaIds  String[],     // 用户上传原件（图/PDF），仿 Post.mediaIds
  pageMediaIds    String[],     // PDF 渲染页图
  metrics         Json,         // §5
  riskAssessment  Json?,        // §8
  healthContext   String?,      // 注入计划/Coach 的紧凑文本块
  aiRunId         String? @unique,
  createdAt, updatedAt, deletedAt?
)
```

一次分析聚合本次上传的**全部来源**（多图 + PDF 归一到同一条报告）。Media 松关联沿用 `String[]`（同 `Post.mediaIds`）。**趋势追踪**先只存 JSON、应用层聚合，**不建投影表**（demo 规模足够；catalog 稳定 key 保证可行；日后可纯增量加投影表）。

### 7. 独立 `reports` 模块 + 单 processor 多步管线

**HTTP（`apps/api/src/modules/reports`）**

| 端点                            | 职责                                                                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/reports`              | body `{ sourceMediaIds[] }`（先经现有 presigned 上传拿 id）；建 `HealthReport(QUEUED)` + `AiRun(REPORT_ANALYZE)` 入队；返回 `{ reportId, taskId }` |
| `GET /v1/reports`               | 列表（时间倒序）                                                                                                                                   |
| `GET /v1/reports/:id`           | 详情（指标、评估、页图预签名 URL）                                                                                                                 |
| `PATCH /v1/reports/:id/metrics` | 手动修正指标 → 触发仅阶段 2 重评估                                                                                                                 |
| `DELETE /v1/reports/:id`        | 软删                                                                                                                                               |

**worker（`report-analyze.processor`）**：`拉取 HealthReport + media` → `PDF 则 pdfjs 渲染页图回存 MinIO、写 pageMediaIds` → `阶段1 抽取 + catalog 归一 + Zod` → `阶段2 评估` → `回写 HealthReport + AiRun(DONE)`。processor 按 `AiRun.taskType` 分 `REPORT_ANALYZE`（全链路）/ `REPORT_REASSESS`（仅阶段 2）两分支，重评估幂等。

客户端复用现有 `GET /v1/ai/tasks/:taskId` 或轮询 `GET /v1/reports/:id` 的 `status`（节奏 1/2/4/8s）。

### 8. 风险评估深度：A（只读洞察）+ B（喂下一次计划），不做 C（主动改当前计划）

- **A**：`riskAssessment` = 异常项解读 + 健身/生活方式提示，纯展示。
- **B**：`healthContext`（紧凑文本块）注入**下一次**计划生成与 Coach；**不改动已有计划**。
- **不做 C**：不就地 diff 修改当前 4 周计划（状态复杂度高、健康驱动自动改训练量风险收益比低）。

**healthContext 注入策略**：只注入该用户**最近一份 `DONE` 报告**、且在**新鲜度窗口（默认 12 个月）内**；自动注入、**无用户开关**。注入点：`UserContextService.mergePlanGeneratorInput`（计划）与 Coach system prompt（ADR 0008 情景记忆同构）。窗口常量放 `packages/shared/constants`。

### 9. 医疗安全护栏

1. **定位话术**：AI 产出定性为「健身/生活方式视角提示」，**非医疗诊断**。阶段 2 prompt 硬约束：只做「是否偏离参考范围 + 对训练/饮食影响 + 何时建议就医」；**禁止**下疾病诊断、开药、给治疗方案；危急值统一输出「建议尽快就医」。
2. **前端固定免责声明**：报告详情页固定挂 disclaimer，文案入 `packages/shared/i18n`。
3. **severity 简单分档**：`riskAssessment` 项含 `severity`（如 `NORMAL | ATTENTION | URGENT`）；catalog 的 `criticalLow/High` 命中升 `URGENT`、前端高亮「尽快就医」，避免模型自由发挥严重程度。

### 10. 配额与模型

| taskType                      | 日限   | 模型                                          |
| ----------------------------- | ------ | --------------------------------------------- |
| `REPORT_ANALYZE`              | **3**  | 阶段1 `QWEN_VL_MAX` + 阶段2 `DEEPSEEK_V4_PRO` |
| `REPORT_REASSESS`（新增枚举） | **10** | 仅阶段2 `DEEPSEEK_V4_PRO`                     |

重评估用独立 `REPORT_REASSESS`，**不吃**分析额度、账目可分。成本记账沿用 `AiRun` token/cost 字段。

### 11. 移动端

- **入口**：「我的」(Profile) 增「体检报告」入口行（不新增 tab；底部 5 tab 已满）。
- **三页**（push 进 `RootStackParamList`）：`ReportList` / `ReportUpload`（多图 + PDF）/ `ReportDetail`（原件预览、分类指标表、异常高亮、可点修正、风险评估 + severity、底部免责声明）。
- **文件选择**：图片复用 `features/media`；PDF 新增 `react-native-document-picker`（bare RN 需原生链接）。

### 12. Coach 打通：上下文注入（非工具）

将最近一份报告的 `healthContext` 注入 Coach system prompt（与 B 档同一份产物），使 Coach 谈及体检不失忆。**不**新增 `get_health_report` 工具（指标详情用户可进详情页看，工具档收益不抵复杂度）。

## Consequences

- **正面**：与餐照/计划链路同构，复用 media + AiRun + 轮询；catalog 数据驱动使指标演进零 migration；两阶段使修正后仅重算阶段 2；A+B 保守稳妥、规避医疗越界。
- **负面**：worker 新增 `pdfjs-dist`（Windows 下 canvas 原生依赖需留意）；移动端新增 `react-native-document-picker`；多页 PDF 抬高阶段 1 token 成本；`ReadUploadUrlsRequestSchema.objectKeys` 上限 5 需放宽以支持多页读 URL。
- **对既有**：新增 `HealthReport` 模型、`REPORT_REASSESS` 枚举需 migration；`reports` 模块落地 ARCH §9 的 `(reports)` 占位。

## References

- PRD §3.2 P1、§7；ARCHITECTURE §4、§9
- ADR 0003（Worker）、0004（presigned）、0005（UserContext）、0008（Coach 注入）
- `docs/issues/report/README.md`（分切片实施文档）

## Status

Accepted · 2026-08-04
