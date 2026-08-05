# REPORT-02 — 阶段 2 风险评估 + healthContext + 医疗安全护栏

| 字段           | 值                          |
| -------------- | --------------------------- |
| **Type**       | AFK                         |
| **Blocked by** | [REPORT-01](./REPORT-01.md) |
| **Blocks**     | REPORT-04、REPORT-05        |
| **估时**       | 2–3 天                      |
| **状态**       | ⬜ 未开工                   |

---

## 1. 目标

在 REPORT-01 抽取的结构化指标之上，追加**阶段 2**：用 DeepSeek 基于 `metrics` + 用户档案生成**风险评估**（异常解读 + 健身/生活方式提示，含 severity 分档）与内部 **healthContext**（供 REPORT-05 注入计划/Coach 的紧凑文本块）。落地医疗安全护栏（非诊断话术 + 前端免责声明已在 01，本切片强化 prompt 约束 + severity）。

---

## 2. 背景

- 两阶段设计见 ADR 0009 §3；A+B 深度见 §8；安全护栏见 §9
- 阶段 2 是**纯文本推理**（吃 metrics，不吃图），可脱离图片单独重跑 → 为 REPORT-04 的重评估铺路
- 先例：`packages/ai-core/src/chains/meal-vision/advice.ts`（VLM 结果 → DeepSeek 建议）

---

## 3. 前置阅读

1. [ADR 0009](../../adr/0009-health-report-analysis.md) §3、§8、§9
2. [REPORT-01](./REPORT-01.md) §4.4、§4.7（抽取链 + processor）
3. `packages/ai-core/src/chains/meal-vision/advice.ts`
4. `apps/api/src/domain/user-context.service.ts`（档案获取）

---

## 4. 详细规格

### 4.1 catalog 增补 critical 阈值

`packages/shared/src/constants/health-metrics.ts` 每条可选加 `criticalLow?` / `criticalHigh?`（危急值）。命中即在 severity 升 `URGENT`。仅给有明确危急阈值的指标填（如血糖、血压、肌酐），其余留空。

### 4.2 共享 Zod 契约（`packages/shared/src/schemas/health-report.ts` 扩展）

```ts
RiskSeverity = z.enum(['NORMAL', 'ATTENTION', 'URGENT']);

RiskFindingSchema = {
  metricKey: z.string().optional(), // 关联指标（otherItems 可空）
  title: z.string().max(120),
  detail: z.string().max(1024), // 健身/生活方式视角解读
  severity: RiskSeverity,
};

RiskAssessmentSchema = {
  overallSummary: z.string().max(2048),
  findings: z.array(RiskFindingSchema).default([]),
  seeDoctorAdvised: z.boolean().default(false), // 有 URGENT 或模型判断需就医
};
```

`HealthReportDetailSchema.riskAssessment` 由 `z.unknown()` 收窄为 `RiskAssessmentSchema.nullable()`。`healthContext` 不对外暴露（仅内部/REPORT-05 用）。

### 4.3 ai-core 阶段 2（`packages/ai-core/src/chains/report-assess/`）

- `runReportAssess(input, options?)`：input `{ metrics: HealthReportMetrics, profile: {...}, criticalHits?: string[] }`
- `createDeepSeekClient().generateJson`（`DEEPSEEK_V4_PRO`，低温度）
- prompt（`packages/ai-core/src/prompts/report-assess.ts`）硬约束（ADR 0009 §9）：
  - 定性「健身/生活方式视角提示，非医疗诊断」
  - **只**做：偏离参考范围解读 + 对训练/饮食影响 + 何时建议就医
  - **禁止**：疾病诊断、开药、治疗方案
  - 危急值 → severity=URGENT 且输出「建议尽快就医」，`seeDoctorAdvised=true`
- 同时产出 `healthContext`：一段 ≤512 字紧凑文本（关键异常项 + 训练/饮食注意），风格类比 Agent memory-block
- 输出 schema：`{ riskAssessment: RiskAssessmentSchema, healthContext: string }`；`parseJsonWithSchema` 校验 + 重试
- 返回 `{ result, usage, rawText }`

> critical 命中判定放 API 侧（用 catalog 的 criticalLow/High 比对 metrics），把 `criticalHits` 传入，保证 URGENT 不完全依赖模型。

### 4.4 processor 串接阶段 2

`report-analyze.processor` 在阶段 1 写完 metrics 后：

1. 取用户 `Profile`
2. 用 catalog 计算 `criticalHits`
3. 调 `runReportAssess({ metrics, profile, criticalHits })`
4. 回写 `HealthReport.riskAssessment` + `healthContext`；累加 usage/cost 到 `AiRun`
5. 阶段 2 失败**不**回滚阶段 1（metrics 已有价值）：标记 `riskAssessment=null` 但 `HealthReport.status=DONE`，记 warn；或按团队约定置部分失败态（建议前者，保证指标可见）

### 4.5 移动端

`ReportDetail` 增「AI 评估」块：`overallSummary` + findings 列表（按 severity 着色：URGENT 红/ATTENTION 黄/NORMAL 常规）；`seeDoctorAdvised` 时顶部醒目提示「建议尽快就医」。免责声明（01 已有）保持在底部。

---

## 5. 建议改动文件

| 路径                                               | 动作                              |
| -------------------------------------------------- | --------------------------------- |
| `packages/shared/src/constants/health-metrics.ts`  | 加 criticalLow/High               |
| `packages/shared/src/schemas/health-report.ts`     | RiskAssessment 相关 + 收窄 detail |
| `packages/ai-core/src/chains/report-assess/`       | 新建评估链                        |
| `packages/ai-core/src/prompts/report-assess.ts`    | 新建 prompt                       |
| `apps/api/src/workers/report-analyze.processor.ts` | 串接阶段 2 + criticalHits         |
| `apps/mobile/src/features/report/ReportDetail*`    | 评估块 UI                         |

---

## 6. Acceptance criteria

- [ ] `pnpm typecheck` 全仓通过
- [ ] 分析完 `HealthReport.riskAssessment` 有 `overallSummary` 与 findings，`healthContext` 非空
- [ ] 命中 catalog criticalHigh 的指标 → 对应 finding `severity=URGENT` 且 `seeDoctorAdvised=true`
- [ ] prompt 产出不含诊断/开药措辞（人工抽检 + 至少 1 个 parse 单测）
- [ ] 阶段 2 失败时指标仍可见（status=DONE、riskAssessment=null）
- [ ] 移动端评估块按 severity 着色，URGENT 显示就医提示

---

## 7. 验证步骤

```powershell
pnpm --filter shared build && pnpm typecheck
pnpm --filter api start:worker   # 需 DASHSCOPE + DEEPSEEK Key
pnpm --filter api start:api
# 手测：传一张含异常项（如高血糖）的报告，检查评估块与 severity
```

---

## 8. 不做

- 手动修正触发的重评估（REPORT-04；本切片只在完整分析末尾跑阶段 2）
- healthContext 的实际注入（REPORT-05；本切片只生成并落库）
- PDF（REPORT-03）

---

## 9. 交付物 / 下游

| 交付物                                  | 消费者                             |
| --------------------------------------- | ---------------------------------- |
| `RiskAssessmentSchema` + severity       | REPORT-04 重评估结果、移动端       |
| `runReportAssess`（仅阶段 2、可独立跑） | REPORT-04（REASSESS 复用同一函数） |
| `HealthReport.healthContext`            | REPORT-05（注入计划/Coach）        |
