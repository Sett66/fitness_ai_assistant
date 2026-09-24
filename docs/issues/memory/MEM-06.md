# MEM-06 — 用户可控记忆与观测

| 字段           | 值                                           |
| -------------- | -------------------------------------------- |
| **Type**       | AFK                                          |
| **Wave**       | W4                                           |
| **Blocked by** | [MEM-03](./MEM-03.md)、[MEM-05](./MEM-05.md) |
| **Blocks**     | —                                            |
| **估时**       | 3 天                                         |
| **状态**       | ⬜ 未开工                                    |

---

## 1. 目标

让用户看见、改正、删掉教练记住的事实。用户删除写入抑制名单，Agent 不能把同一 key 自动写回来；用户自己新增或编辑则解除抑制。

同时把三条记忆指标接到现有 Langfuse：写入拒绝率、召回命中率、用户删除率。

---

## 2. 背景

ADR 0012 §5。抑制名单的判定在 MEM-02 的 `isSuppressed`：最新事件为 `USER` + `DELETE` 且行仍软删除。MEM-03 的 `save_memory` 已会拒绝这类 key。本切片补的是**产生** `USER` 事件的 HTTP API，以及移动端入口。

Langfuse 的 Coach trace 已在 [`apps/api/src/infra/observability/`](../../../apps/api/src/infra/observability/)（ADR 0010）。本切片只加 score / event，不新建观测后端。

记忆管理是纠错通道，也是 golden set 之外唯一的真实负样本来源。软删除行和审计事件必须留下，不要在用户删除时物理删除。

---

## 3. 前置阅读

1. [ADR 0012](../../adr/0012-coach-memory-tooling-and-hybrid-recall.md) §1 抑制名单、§5、§7
2. 现有 `users/me` 控制器的鉴权写法（只操作当前用户）
3. [MEM-04](./MEM-04.md) 的 `index` / `remove`：用户改动必须同步索引，不能只改 Postgres
4. 移动端 Coach 设置或个人页的导航入口（实施时选已有「我的」页面，不新开底部 Tab）

---

## 4. 详细规格

### 4.1 HTTP

全部要求登录，只触及 `userId = 当前用户` 的行。响应用 Zod DTO，放在 `packages/shared`。

| 方法     | 路径                        | 行为                                                                                                                                                                                  |
| -------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/v1/users/me/memories`     | 未删除记忆，按 category 分组。字段：`id`、`key`、`category`、`value`、`updatedAt`。不含事件流水、不含已软删除                                                                         |
| `POST`   | `/v1/users/me/memories`     | body：`category`、`slug`、`value`。校验与 MEM-03 相同（白名单、slug 规范化、时效词拒绝）。若该 key 处于抑制或软删除，复活原行并写 `RESTORE` 或 `CREATE`，`actor = USER`，从而解除抑制 |
| `PATCH`  | `/v1/users/me/memories/:id` | 只改 `value`。`actor = USER`，`action = UPDATE`。不能改别人的 id（404，不要 403 以免探活）                                                                                            |
| `DELETE` | `/v1/users/me/memories/:id` | 软删除，事件 `DELETE` + `actor = USER`。这就是抑制名单的来源                                                                                                                          |

写入成功后同步 Meili：POST/PATCH 走 `index`（含重新 embedding），DELETE 走 `remove`。索引失败时 API 仍返回成功（数据库已对），打 warn，`embeddedAt = null`，留给 `reindex:memories`。与 `MEMORY_PERSIST` 同一原则：不回滚用户已经确认的修改。

`GET` 不返回 `confidence`、`sourceMessageId`、审计表。

### 4.2 与 Agent 的交界

- 用户 DELETE 之后，MEM-03 的 `save_memory` 必须失败（已有行为，本切片补一条 API 级测试串起来）
- 用户 POST 同一 key 之后，Agent 可以再次 `save_memory` 更新它
- Agent 的 `forget_memory` 是 `actor = AGENT`，**不**进入抑制名单。只有用户删除才抑制

### 4.3 移动端

在「我的」里增加「教练记得什么」：

- 按类别中文名分组（伤病、饮食限制、饮食偏好、器械、时间、地点、目标、其他）
- 每条展示 value，提供编辑与删除；删除前确认
- 空状态说明「教练还没有记下稳定偏好」
- 提供新增：选类别、填一句描述。slug 由服务端从 value 规范化生成时，若冲突则更新该 key 的 value（与 POST 复活语义一致）。客户端可以不暴露 slug，body 里带 slug 时以客户端为准

不在 Coach 聊天气泡里做记忆卡片。本切片只做列表页。

### 4.4 Langfuse

在已有 Coach trace 上记，不新开项目：

| 指标                   | 含义                                                                         |
| ---------------------- | ---------------------------------------------------------------------------- |
| `memory_save_rejected` | `save_memory` 被校验或抑制名单拒绝 / 调用次数                                |
| `memory_recall_hit`    | `recall_memory` 返回条数 > 0 的比例；降级路径单独打 `memory_recall_fallback` |
| `memory_user_delete`   | 用户 DELETE 次数（按天、按用户即可，不要把 value 放进 score comment）        |

禁止把记忆 value 写入 Langfuse 的 input/output。key 可以。

### 4.5 负样本出口

用户 DELETE 的审计行就是负样本。本切片不自动改写 `golden-set.json`。在 README 或本文件注明：每月可从 `UserAgentMemoryEvent` 中 `actor=USER AND action=DELETE` 抽若干条，人工补进 golden set。不要做自动管道。

---

## 5. 建议改动文件

| 路径                                                  | 动作                          |
| ----------------------------------------------------- | ----------------------------- |
| `packages/shared/src/schemas/`                        | 记忆 DTO                      |
| `apps/api/src/modules/` 下 users 或新建 memories 模块 | 四个端点                      |
| `apps/api/src/domain/agent-memory.service.ts`         | USER actor 的创建、更新、删除 |
| `apps/api/src/infra/search/memory-search.provider.ts` | API 路径上的 index/remove     |
| `apps/mobile/src/features/`                           | 「教练记得什么」页与入口      |
| `apps/api/src/infra/observability/`                   | 三个 score                    |
| `apps/api` 对应 `*.spec.ts`                           | 抑制名单闭环                  |

---

## 6. Acceptance criteria

- [ ] 用户只能看到自己的未删除记忆；用别人的 id 调用 PATCH/DELETE 得到 404
- [ ] DELETE 后 GET 不再返回；库中行还在，最新事件为 `USER/DELETE`；Meili 中该 id 消失
- [ ] DELETE 之后对话里重说同一事实，`save_memory` 被拒绝，行不被复活
- [ ] 用户 POST 同一 key 后，GET 能看到，且 Agent 之后可以更新它
- [ ] PATCH 只改 value，key 与 category 不变，审计为 `USER/UPDATE`
- [ ] 时效词 value（「今天膝盖疼」）POST 返回 400
- [ ] 移动端列表按类别分组，编辑和删除后重新进入页面数据一致
- [ ] Langfuse 事件中没有记忆 value

---

## 7. 验证步骤

```powershell
pnpm --filter api test -- memories
pnpm --filter api start:worker
pnpm --filter api start:api
```

移动端：打开「教练记得什么」，删除一条伤病，回到 Coach 用原话再说一遍，确认教练没有把它记回来。再手动新增同一条，确认列表出现，并且下一轮训练建议会避开该动作。

---

## 8. 不做

- 记忆导出、跨用户共享、value 静态加密
- 在聊天流里展示「我记住了」卡片
- 自动把用户删除写回 golden set
- 物理删除审计行或记忆行
- 新的观测基础设施

---

## 9. 交付物 / 下游

| 交付物                           | 消费者                                             |
| -------------------------------- | -------------------------------------------------- |
| `/v1/users/me/memories` 四个端点 | 移动端页面；后续若要做记忆纠错分析                 |
| `USER/DELETE` 审计               | 人工回补 golden set 的原料                         |
| 三个 Langfuse 指标               | 判断工具是否误触发、召回是否被使用、用户是否在纠错 |
