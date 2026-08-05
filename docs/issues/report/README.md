# 体检报告分析 · 分切片实施文档

> **Epic**：Phase 2（M6）体检报告识别 — 上传图片/PDF → VLM 抽取指标 → 风险评估 → 健康上下文注入计划/Coach
> **架构依据**：[ADR 0009](../../adr/0009-health-report-analysis.md)（体检报告分析）
> **前提**：M0–M5 已关闭；社交功能本 Epic 不做
> **状态（2026-08-04）**：切片评审通过，待实施

## 给接手 Agent 的通用说明

复制下面整段到新会话开头，再附上你所负责切片的文档全文。

```
你是 Fitness AI Assistant monorepo 的实施 Agent，负责 docs/issues/report/REPORT-XX.md 所描述的单一切片。

环境：Windows + PowerShell；pnpm monorepo；bare React Native（禁止 Expo）。
契约：packages/shared 的 Zod 为唯一端到端真相；重大架构变更需 ADR。
硬性约束：
- 客户端禁止直连 LLM / 存储 Key（ADR 0003/0004）
- 重任务（VLM 抽取、PDF 渲染、DeepSeek 评估）仅在 BullMQ Worker；HTTP 只 enqueue，绝不在请求进程内跑 VLM/渲染
- AI 输出全量 Zod 校验 + 失败重试；体检分析定性为「健身参考」，非医疗诊断（ADR 0009 §9）
- 用户未明确要求不要 git commit；回复简体中文

本地启动：
pnpm install
docker compose -f docker/docker-compose.yml up -d
pnpm --filter db migrate:dev
pnpm --filter api start:worker
pnpm --filter api start:api
pnpm lint && pnpm typecheck

必读（按切片文档「前置阅读」为准）：
docs/issues/report/REPORT-XX.md
docs/adr/0009-health-report-analysis.md
docs/ARCHITECTURE.md
```

## 切片列表

| ID        | 文档                           | 类型        | 阻塞     | 交付                                         |
| --------- | ------------------------------ | ----------- | -------- | -------------------------------------------- |
| REPORT-01 | [REPORT-01.md](./REPORT-01.md) | AFK         | ADR 0009 | 图片报告最小闭环：上传→VLM抽取→结构化展示    |
| REPORT-02 | [REPORT-02.md](./REPORT-02.md) | AFK         | 01       | 阶段2风险评估 + healthContext + 安全护栏     |
| REPORT-03 | [REPORT-03.md](./REPORT-03.md) | AFK         | 01       | PDF 支持（服务端 pdfjs 渲染 + 移动端选择）   |
| REPORT-04 | [REPORT-04.md](./REPORT-04.md) | AFK         | 02       | 手动修正指标 + 自动重评估（REPORT_REASSESS） |
| REPORT-05 | [REPORT-05.md](./REPORT-05.md) | AFK         | 02       | healthContext 注入计划生成 + Coach           |
| REPORT-06 | [REPORT-06.md](./REPORT-06.md) | AFK（可选） | 01       | 报告趋势/历史（应用层 JSON 聚合）            |

### 依赖图

```
ADR 0009
   │
   ▼
REPORT-01 ─┬─► REPORT-02 ─┬─► REPORT-04
           │              └─► REPORT-05
           ├─► REPORT-03
           └─► REPORT-06 (可选)
```

**建议实施顺序**：ADR 0009 → 01 → 02 →（03 / 04 / 05 可并行）→ 06（可选）。

## 关键决策速查（详见 ADR 0009）

- VLM（Qwen-VL-Max）直接识图，不引独立 OCR
- PDF 在 worker 用 `pdfjs-dist` 按页渲染回存 MinIO，归一为图片页
- 两阶段：Qwen-VL 抽取 → DeepSeek 评估；阶段 2 可独立重跑
- 指标数据驱动 catalog（`packages/shared/constants`）+ 指标存 JSON，加指标零 migration
- 混合结构：白名单 items + 长尾 otherItems + summary
- A+B 深度：只读洞察 + 喂下一次计划；不做 C（改当前计划）
- healthContext：最近一份 + 12 个月窗口 + 自动注入无开关
- 配额：REPORT_ANALYZE=3、REPORT_REASSESS=10
- 安全：非诊断 prompt 约束 + 前端免责声明 + severity 分档
- 移动端入口在「我的」；三页 ReportList/ReportUpload/ReportDetail

## 完成后交接

每份切片文档末尾有 **「交付物 / 下游」**。合并前请：

1. 勾选文档内 Acceptance criteria
2. PR 描述链接 `REPORT-XX.md`
3. 若契约/schema 变更，确保 `pnpm typecheck` 全仓通过
