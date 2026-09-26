# MEM-01 — golden set：记忆召回评估集

| 字段           | 值                                                                   |
| -------------- | -------------------------------------------------------------------- |
| **Type**       | AFK                                                                  |
| **Wave**       | W0                                                                   |
| **Blocked by** | [ADR 0012](../../adr/0012-coach-memory-tooling-and-hybrid-recall.md) |
| **Blocks**     | MEM-02                                                               |
| **估时**       | 1 天                                                                 |
| **状态**       | ✅ 已实施                                                            |

---

## 1. 目标

产出一份人工标注的评估集，供 MEM-05 调节 `semanticRatio`、top-k，以及 MEM-03 打磨 `save_memory` 的准入描述。本切片**不改任何运行时代码**。

没有这份集合，后面的检索参数只能靠感觉调，也无法回答「混合召回是否优于按时间全量注入」。

---

## 2. 背景

ADR 0012 §7：≥20 条 `(对话场景 → 应召回的 key 集合)`。重点不是「问句和记忆字面相近」，而是**语义不相似但必须召回**的因果关联，例如练胸必须想起肩伤、跑步必须想起膝伤、增肌饮食必须想起乳糖不耐。

安全类别是 `injury` 与 `diet_restriction`。评估时要单独统计这两类的召回，不能被总体 P@k 平均掉。

---

## 3. 前置阅读

1. [ADR 0012](../../adr/0012-coach-memory-tooling-and-hybrid-recall.md) §1（类别白名单）、§3（安全记忆常驻）、§7
2. [`packages/ai-core/src/memory/extract-memory-facts.ts`](../../../packages/ai-core/src/memory/extract-memory-facts.ts) 里「何时 upsert / 何时 remove / 不要输出」的规则——准入负样本要覆盖这些边界

---

## 4. 详细规格

### 4.1 文件位置

`docs/issues/memory/golden-set.json`。纯数据，不进运行时包。MEM-05 的评测脚本直接读这个文件。

### 4.2 单条样本

```ts
{
  id: string;                          // "recall-01"
  kind: 'recall' | 'reject_write';
  userText: string;                    // 用户本轮原话
  memories: Array<{ key: string; value: string; category: string }>;
  expectedKeys: string[];              // recall：必须命中的 key；reject_write：应为空
  mustNotKeys?: string[];              // 不应被召回或写入的 key
  notes: string;                       // 为什么这是正样本或负样本
}
```

`key` 使用 ADR 0012 的 `category:slug`。类别只能取白名单八个值。

### 4.3 数量与覆盖

至少 20 条，建议 24 条，分布：

| 桶                                      | 至少  | 示例                                                                                                                                |
| --------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 语义不相似但必须召回                    | 8     | 「今天练胸怎么安排」→ `injury:left_shoulder`；「周末去跑步」→ `injury:right_knee`；「加餐喝点牛奶行吗」→ `diet_restriction:lactose` |
| 字面相近、应当召回                      | 4     | 「我肩膀那个伤现在还能推吗」→ `injury:left_shoulder`                                                                                |
| 无关记忆不得召回                        | 4     | 问动作技术时，`location:travel_city` 不得出现在 expectedKeys                                                                        |
| 拒绝写入（一次性 / 时效 / 他人）        | 6     | 「今天有点累」「我朋友膝盖不好」「明天出差去杭州」——`kind: reject_write`，`expectedKeys: []`                                        |
| 安全类至少跨 injury 与 diet_restriction | 各 ≥3 | 计入上面的桶，不另计总数                                                                                                            |

每条 `memories` 放 3–6 条干扰项，不要只有目标那一条，否则评测没有区分度。

### 4.4 不在本切片做的评测

不写跑分脚本、不调 `semanticRatio`、不调用 embedding。那些是 MEM-05。

---

## 5. 建议改动文件

| 路径                                 | 动作     |
| ------------------------------------ | -------- |
| `docs/issues/memory/golden-set.json` | 新建     |
| `docs/issues/memory/MEM-01.md`       | 勾选验收 |

---

## 6. Acceptance criteria

- [x] `golden-set.json` 可被 `JSON.parse`，条数 ≥20
- [x] 每条的 `category` 都在 ADR 0012 §1 白名单内，`key` 以该 category 为前缀
- [x] 「语义不相似但必须召回」≥8，且 injury、diet_restriction 各至少 3 条
- [x] `reject_write` ≥6，覆盖时效词、他人事实、一次性状态
- [x] 每条有 `notes`，说明期望理由

---

## 7. 验证步骤

```powershell
node -e "const a=require('./docs/issues/memory/golden-set.json'); if(!Array.isArray(a)||a.length<20) throw new Error('too few'); console.log(a.length)"
```

人工通读「语义不相似」那 8 条：如果把记忆 value 遮住、只看用户原话，仍然说得清为什么必须召回，这条才算合格。

---

## 8. 不做

- 评测脚本、embedding、Meili
- 修改抽取 prompt 或工具 description（MEM-03 / MEM-05 消费本文件）
- 线上日志采样

---

## 9. 交付物 / 下游

| 交付物                         | 消费者                                                  |
| ------------------------------ | ------------------------------------------------------- |
| `golden-set.json`              | MEM-05 调 `semanticRatio` 与 top-k；MEM-03 对照准入描述 |
| 安全类单独可切片的样本 id 约定 | MEM-05 报告 injury / diet_restriction 召回              |
