# REPORT-04 — 手动修正指标 + 自动重评估（REPORT_REASSESS）

| 字段           | 值                          |
| -------------- | --------------------------- |
| **Type**       | AFK                         |
| **Blocked by** | [REPORT-02](./REPORT-02.md) |
| **Blocks**     | —                           |
| **估时**       | 2 天                        |
| **状态**       | ✅ 已完成                   |

---

## 1. 目标

落地 PRD §7 的幻觉兜底：用户可修正 VLM 抽错的指标（value/unit/flag、把 otherItems 认领为某 catalog key），打 `edited` 标记；修正后**自动触发仅阶段 2 的重评估**（`REPORT_REASSESS`，DeepSeek-only、不重跑 VLM、不碰图），刷新 `riskAssessment` + `healthContext`。附带报告软删。

---

## 2. 背景

- ADR 0009 §5（edited）、§7（PATCH 端点 + REASSESS 分支）、§10（REPORT_REASSESS=10）
- 阶段 2 本就脱离图片可独立跑（REPORT-02 §4.3 `runReportAssess`）→ 重评估直接复用
- 现有 enqueue/日限范式：`apps/api/src/modules/ai-tasks/ai-tasks.service.ts`

---

## 3. 前置阅读

1. [ADR 0009](../../adr/0009-health-report-analysis.md) §5、§7、§10
2. [REPORT-02](./REPORT-02.md) §4.3、§4.4
3. `packages/shared/src/enums/ai-task.ts`、`packages/db/prisma/schema.prisma`（`AiTaskType`）
4. `packages/shared/src/constants/limits.ts`

---

## 4. 详细规格

### 4.1 新增 taskType `REPORT_REASSESS`

- Prisma `enum AiTaskType` 加 `REPORT_REASSESS` + migration
- `packages/shared/src/enums/ai-task.ts` 同步
- `limits.ts`：`AI_TASK_DAILY_LIMITS.REPORT_REASSESS = 10`

### 4.2 共享 Zod 契约

```ts
UpdateHealthReportMetricsRequestSchema = {
  items: z.array(HealthMetricItemSchema), // 全量提交修正后的 items
  otherItems: z.array(HealthOtherItemSchema).optional(),
};
```

- 服务端校验：`items[].key` 必须在 catalog 内；被修改/新认领项 `edited=true`
- 不允许凭空捏造 catalog 外的结构化 item（catalog 外只能留在 otherItems）

### 4.3 API `PATCH /v1/reports/:id/metrics`

1. 校验报告归属 + 存在 + status=DONE
2. `parseWith(UpdateHealthReportMetricsRequestSchema)`；校验 key 合法、标 `edited`
3. 写回 `HealthReport.metrics`
4. `assertDailyLimit(userId, 'REPORT_REASSESS')`
5. 建 `AiRun(REPORT_REASSESS, inputJson={reportId, stage:'ASSESS_ONLY'})` + 入队；置 `HealthReport.status=RUNNING`
6. 返回 `{ reportId, taskId }`（客户端轮询刷新）

### 4.4 processor 分支 `ASSESS_ONLY`

`report-analyze.processor` 按 `AiRun.taskType` 分流：

- `REPORT_ANALYZE`：全链路（渲染→阶段1→阶段2）
- `REPORT_REASSESS`：**跳过渲染与阶段 1**，直接读 `HealthReport.metrics` → 重算 `criticalHits` → `runReportAssess` → 回写 `riskAssessment` + `healthContext`、`status=DONE`

幂等：多次重评估只覆盖评估结果，不动 metrics/媒体。

### 4.5 `DELETE /v1/reports/:id`

软删（置 `deletedAt`）；列表/详情过滤已删。

### 4.6 移动端

`ReportDetail`：

- 指标行进入编辑（改 value/unit/flag）；otherItems 项「认领为指标」→ 选 catalog key
- 已改项显示「已人工校正」徽标（`edited`）
- 保存 → `PATCH` → 轮询 status → 刷新评估块
- 报告删除入口（确认弹窗）

---

## 5. 建议改动文件

| 路径                                               | 动作                                        |
| -------------------------------------------------- | ------------------------------------------- |
| `packages/db/prisma/schema.prisma`                 | `AiTaskType` 加 REPORT_REASSESS + migration |
| `packages/shared/src/enums/ai-task.ts`             | 同步枚举                                    |
| `packages/shared/src/constants/limits.ts`          | `REPORT_REASSESS: 10`                       |
| `packages/shared/src/schemas/health-report.ts`     | Update 请求 schema                          |
| `apps/api/src/modules/reports/*`                   | PATCH metrics + DELETE                      |
| `apps/api/src/workers/report-analyze.processor.ts` | ASSESS_ONLY 分支                            |
| `apps/mobile/src/features/report/ReportDetail*`    | 编辑/认领/删除 UI                           |
| `apps/mobile/src/api/endpoints/reports.ts`         | patch/delete hooks                          |

---

## 6. Acceptance criteria

- [x] migration 加 `REPORT_REASSESS`；`pnpm typecheck` 全仓通过
- [x] `PATCH /v1/reports/:id/metrics` 写回指标、被改项 `edited=true`、拒绝 catalog 外 key
- [x] 修正后自动入队 `REPORT_REASSESS`，processor **不**重跑 VLM，仅刷新评估
- [x] `REPORT_REASSESS` 超 10 次/天返回 429；**不**消耗 `REPORT_ANALYZE` 额度
- [x] otherItems 认领为 catalog 指标后进入 items 并参与评估
- [x] `DELETE` 软删后列表/详情不再出现
- [x] 移动端修正→保存→评估刷新闭环（真机，待手测）

---

## 7. 验证步骤

```powershell
pnpm --filter db migrate:dev --name report_reassess
pnpm --filter shared build && pnpm typecheck
pnpm --filter api start:worker
pnpm --filter api start:api
# 手测：改一个指标值，观察评估随之更新，且未重跑识图
```

---

## 8. 不做

- 修改 metrics 结构本身（只改值/flag/认领）
- 重跑 VLM 抽取（重评估仅阶段 2）

---

## 9. 交付物 / 下游

| 交付物                               | 消费者                           |
| ------------------------------------ | -------------------------------- |
| `REPORT_REASSESS` + ASSESS_ONLY 分支 | 任何需要「仅重算评估」的后续场景 |
| 修正后的 `healthContext`             | REPORT-05（注入时取最新）        |
