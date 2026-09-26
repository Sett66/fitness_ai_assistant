# MEM-05 — 召回：记忆索引常驻、安全记忆与 recall_memory

| 字段           | 值                                           |
| -------------- | -------------------------------------------- |
| **Type**       | AFK                                          |
| **Wave**       | W3b                                          |
| **Blocked by** | [MEM-03](./MEM-03.md)、[MEM-04](./MEM-04.md) |
| **Blocks**     | MEM-06                                       |
| **估时**       | 2–3 天                                       |
| **状态**       | ✅ 已实施                                    |

---

## 1. 目标

停止把全部记忆 value 塞进 system prompt。改为常驻一份只含 `category:key` 的【记忆索引】，外加最多 5 条安全类 value；模型需要细节时调用 `recall_memory`。Meili 或 embedding 不可用时，退回按时间取 20 条 value，记忆系统不能因为检索挂了而变空。

用 [golden set](./golden-set.json) 选出 `semanticRatio`，并把 injury / diet_restriction 的召回单独报出来。

---

## 2. 背景

今天 [`formatMemoryBlock`](../../../packages/ai-core/src/memory/format-memory-block.ts) 把最多 20 条 `key: value` 全部注入，[`buildCoachSystemPrompt`](../../../packages/ai-core/src/chains/coach-chat/build-system-prompt.ts) 在 Agent 与流式两条路径共用。

[`get_user_fitness_snapshot`](../../../apps/api/src/domain/agent/tool-registry.service.ts) 的返回值里还有一份完整 `memoryFacts`。如果 prompt 改了、这个工具仍返回全部 value，索引就形同虚设。

ADR 0012 把安全类 value 直接常驻，是因为「练胸」和「左肩有伤」在向量空间里并不近，漏召回会变成危险建议。这部分不参与检索取舍。

---

## 3. 前置阅读

1. [ADR 0012](../../adr/0012-coach-memory-tooling-and-hybrid-recall.md) §3、§7、Consequences 中「安全类记忆的收紧」
2. [MEM-04](./MEM-04.md) 的 `MemorySearchProvider` 与 `MEMORY_HYBRID_SEMANTIC_RATIO`
3. [MEM-01](./MEM-01.md) 与 `docs/issues/memory/golden-set.json`
4. [`packages/ai-core/src/graphs/coach-agent/tools-schema.ts`](../../../packages/ai-core/src/graphs/coach-agent/tools-schema.ts)

---

## 4. 详细规格

### 4.1 Prompt 块

替换 Agent 模式里的【长期记忆】全量 value 块。流式非 Agent 路径（flag 显式 false）保持现状，本切片不改它。

**[记忆索引]**（常驻）

- 只列未删除记忆的 `category:key`，每行一个，不含 value
- 上限 60。安全类别 `injury`、`diet_restriction` 排在前面，其余按 `updatedAt desc` 截断
- 空则整块省略

**[安全记忆]**（常驻）

- 仅 `injury` 与 `diet_restriction` 的未删除行，最多 5 条，格式 `- key: value`
- 超过 5 条时按 `updatedAt desc` 取 5，其余仍出现在索引里，模型可通过 `recall_memory` 展开
- 块尾加一句：这些限制在推荐训练和饮食时必须遵守

两块都加在现有 `appendSharedContextBlocks` 的记忆位置，只在 `mode === 'agent'` 使用。不要再调用旧的 `formatMemoryBlock` 注入全部 value。

### 4.2 `recall_memory`

`CoachToolNameSchema`、日限、中文标签一并加上。

| 项         | 值                                                                                |
| ---------- | --------------------------------------------------------------------------------- |
| 入参       | `query`（必填，≤200 字）、`category?`                                             |
| 日限       | 50 / 用户自然日                                                                   |
| 返回       | 最多 5 条 `{ key, category, value }`，给模型的 observation 用短列表               |
| 计入 ReAct | **计入** `MAX_TOOL_ITERATIONS`（与 save/forget 不同，这是回答问题所需的一次调用） |

实现：`MemorySearchProvider.search(userId, query, { category })`。命中后异步更新 `lastUsedAt` 与 `hitCount`（失败只打日志，不影响 observation）。

工具 description 写明：索引里出现的 key，当问题可能受该事实影响时再调用本工具展开；不要为了闲聊调用；安全类若已在【安全记忆】给出 value，不必重复调用。

### 4.3 降级

`search` 抛错，或 embedding 不可用时：

- observation 改为未删除记忆按 `updatedAt desc` 最多 20 条的 `key: value` 列表，并加一句「检索暂不可用，以下为最近记忆」
- 不让工具 `ok: false` 把整轮对话打成失败
- 打一条 warn，不打 value 以外的用户隐私到 error 堆栈

### 4.4 去掉快照里的重复记忆

`get_user_fitness_snapshot` 不再返回 `memoryFacts`。档案、营养、计划摘要保留。避免模型绕过索引拿到全部 value。

### 4.5 用 golden set 定 `semanticRatio`

写一个不进生产路径的脚本（`apps/api/src/scripts/eval-memory-recall.ts` 即可）：

1. 对每条 `kind: recall` 样本，把 `memories` 写入**专用评测用户**（脚本创建并在结束时软删除），reindex 该用户
2. 用 `userText` 作 query，取 top-5
3. 报告总体 P@5，以及 expectedKeys 落在 injury / diet_restriction 的命中率
4. 在 `0.3`、`0.5`、`0.7` 三档中选总体 P@5 最高的一档写入 `MEMORY_HYBRID_SEMANTIC_RATIO`；若安全类命中率低于该档总体，在 PR 里说明，不要为了总体分牺牲安全类却不留记录

`reject_write` 样本不参与本脚本。评测用户的记忆必须在结束时软删除并从索引移除。

本切片不追求自动 CI 每次打真实 embedding（需要 DashScope）。脚本本地可跑，结果写进本文件验收记录。

---

## 5. 建议改动文件

| 路径                                                            | 动作                                    |
| --------------------------------------------------------------- | --------------------------------------- |
| `packages/ai-core/src/memory/format-memory-block.ts`            | 索引块与安全块；旧全量块仅非 Agent 使用 |
| `packages/ai-core/src/chains/coach-chat/build-system-prompt.ts` | Agent 模式改用新块                      |
| `packages/ai-core/src/graphs/coach-agent/tools-schema.ts`       | `recall_memory`                         |
| `packages/shared/src/schemas/agent.ts`                          | 工具名                                  |
| `packages/shared/src/constants/coach-tools.ts`                  | 日限 50 与文案                          |
| `apps/api/src/domain/agent/tool-registry.service.ts`            | 检索、降级、去掉快照中的 memoryFacts    |
| `apps/api/src/infra/search/` 中的比例常量                       | 按评测结果修改                          |
| `apps/api/src/scripts/eval-memory-recall.ts`                    | 新建                                    |

---

## 6. Acceptance criteria

- [ ] Agent system prompt 中不再出现非安全类记忆的 value；索引最多 60 条且不含 value
- [ ] 存在肩伤记忆时，即使用户只说「今天练胸」，【安全记忆】里仍有该条 value
- [ ] 问「我之前说的常出差城市」时，模型可通过 `recall_memory` 拿到 `location:*` 的 value（Meili 可用的前提下）
- [ ] 停掉 Meili 后，`recall_memory` 仍返回最近 20 条，SSE 不以 error 结束
- [ ] `get_user_fitness_snapshot` 的 observation 不含记忆 value
- [ ] golden set 三档比例的 P@5 与安全类命中率记在下方验收记录，常量与所选档一致
- [ ] 命中一次后 `hitCount` 增加（允许异步，刷新数据库可见即可）

**验收记录**：2026-09-24；`0.3` P@5=`1.000`、安全类=`1.000`；`0.5` P@5=`1.000`、安全类=`1.000`；`0.7` P@5=`1.000`、安全类=`1.000`。三档并列，保留 ADR 初始默认值 `0.5`，不为同分结果增加语义偏置。

---

## 7. 验证步骤

```powershell
pnpm --filter api reindex:memories
pnpm --filter api exec tsx src/scripts/eval-memory-recall.ts
pnpm --filter api start:worker
pnpm --filter api start:api
```

手工：写入 `injury:left_shoulder` 与 `location:travel_shanghai`，新会话问「胸推怎么安排」，确认回复避开推举且没有先把出差城市写进正文。再问「我常去哪出差」，确认调用了 `recall_memory`（SSE `tool_start`）。

---

## 8. 不做

- 独立的 query 改写 LLM 调用（query 就是模型传给 `recall_memory` 的参数）
- 用户记忆管理页面（MEM-06）
- 改非 Agent 流式路径的记忆注入
- 会话滚动摘要
- 把 `recall_memory` 排除在 `MAX_TOOL_ITERATIONS` 之外

---

## 9. 交付物 / 下游

| 交付物                      | 消费者                                 |
| --------------------------- | -------------------------------------- |
| `recall_memory` 调用与命中  | MEM-06 Langfuse 指标                   |
| 选定的 `semanticRatio`      | 后续调参只改常量并重跑评测脚本         |
| 索引 + 安全块的 prompt 形状 | 记忆管理页的展示分组可与 category 对齐 |
