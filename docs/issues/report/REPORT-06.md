# REPORT-06 — 报告趋势 / 历史（应用层 JSON 聚合）·（可选）

| 字段           | 值                          |
| -------------- | --------------------------- |
| **Type**       | AFK（可选）                 |
| **Blocked by** | [REPORT-01](./REPORT-01.md) |
| **Blocks**     | —                           |
| **估时**       | 1–2 天                      |
| **状态**       | ⬜ 未开工（本 Epic 可延后） |

---

## 1. 目标

利用 catalog 稳定 key，实现**同一指标跨多次报告的趋势**（如 LDL 三次体检走势）。趋势在**应用层**基于 `HealthReport.metrics` JSON 聚合，**不建投影表**（ADR 0009 §6）。

> 本切片为可选加厚项；核心闭环（01–05）不依赖它。

---

## 2. 背景

- ADR 0009 §6：趋势只存 JSON、应用层算；catalog key 保证可聚合
- 报告详情/列表已具备（REPORT-01）

---

## 3. 前置阅读

1. [ADR 0009](../../adr/0009-health-report-analysis.md) §4、§6
2. [REPORT-01](./REPORT-01.md)（列表/详情、catalog）

---

## 4. 详细规格

### 4.1 共享 Zod

```ts
MetricTrendPointSchema = { reportId, reportDate?, createdAt, value, flag }
MetricTrendSchema = {
  key, nameZh, unit, refLow?, refHigh?,
  points: z.array(MetricTrendPointSchema),   // 时间升序
}
HealthTrendResponseSchema = { trends: z.array(MetricTrendSchema) }
```

### 4.2 API `GET /v1/reports/trends`

- query 可选 `keys=LDL,HDL,...`（默认返回 fitnessRelevant 且出现过 ≥2 次的指标）
- service：拉该用户全部 DONE 报告 metrics → 按 key 归并数值型指标 → 组装趋势（值非数值的指标跳过）
- 时间轴用 `reportDate ?? createdAt`

### 4.3 移动端

- `ReportList` 顶部或独立 `ReportTrends` 视图：折线/迷你图展示选定指标随时间变化，参考范围区间作背景带
- 复用 UI 图表能力（若无则简单自绘/轻量库，遵循无重依赖原则）

---

## 5. 建议改动文件

| 路径                                           | 动作          |
| ---------------------------------------------- | ------------- |
| `packages/shared/src/schemas/health-report.ts` | 趋势 schema   |
| `apps/api/src/modules/reports/*`               | `GET /trends` |
| `apps/mobile/src/features/report/*`            | 趋势视图      |
| `apps/mobile/src/api/endpoints/reports.ts`     | trends hook   |

---

## 6. Acceptance criteria

- [ ] `pnpm typecheck` 全仓通过
- [ ] `GET /v1/reports/trends` 按 key 归并多份报告、时间升序返回
- [ ] 仅出现 ≥2 次的数值型指标进入默认趋势；非数值指标不报错
- [ ] 移动端趋势视图可读，含参考范围区间
- [ ] 无投影表（纯 JSON 聚合）

---

## 7. 验证步骤

```powershell
pnpm --filter shared build && pnpm typecheck
pnpm --filter api start:api
# 手测：分析 ≥2 份含同指标的报告，查看趋势
```

---

## 8. 不做

- 关系型投影表（保持应用层聚合）
- 复杂统计/预测

---

## 9. 交付物 / 下游

| 交付物          | 消费者                                         |
| --------------- | ---------------------------------------------- |
| 趋势聚合 + 视图 | 用户查看长期变化；未来若需投影表可无痛替换实现 |
