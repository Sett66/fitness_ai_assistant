# 0013 — Coach 可恢复流式协议：真实增量、最终快照与取消语义

## Context

Coach `CHAT` 当前通过 `POST /v1/conversations/:id/messages/stream` 在单个 HTTP 请求内完成「创建用户消息与助手占位 → 执行 Agent/纯聊天模型 → 发送 SSE → 持久化终态」。模型适配层已经同时产出本次新增的 `delta` 与累计全文 `text`，但 API 的业务 `delta` 事件实际发送累计全文，移动端再用该全文覆盖 Zustand 中的临时助手消息。

这一实现简化了客户端状态同步，但存在以下问题：

- 业务事件名为 `delta`，实际语义却是累计快照；长回答会重复传输已有正文，传输量随正文增长接近平方级
- 移动端断线后只能中止当前 XHR；重试原 POST 会重复创建用户消息、助手消息和 `AiRun`
- 请求连接同时承担生成生命周期；切换会话、网络闪断与用户主动停止无法被可靠地区分
- 客户端“停止生成”只断开接收，服务端通常仍会继续生成并落库
- Agent 对累计文本执行 DSML 清洗，清洗结果可能发生非追加变化，无法直接转换成纯文本增量
- 部分回答在取消后如何展示、持久化以及是否进入下一轮模型上下文没有明确语义
- API 未监听连接关闭，也没有可供补播的短期事件日志

本 ADR 将传输协议改为真实增量，并把“启动一次生成”与“可重复订阅生成结果”拆开。系统尚未发布，无需兼容旧版移动端，因此现有 `delta` 事件可以直接变更语义，不保留 V1 双轨协议。

## Decision

### 1. 目标与范围

本次改造同时交付：

1. `delta.text` 改为真实新增片段
2. 所有订阅事件使用全局递增序号
3. 终态事件携带权威最终快照，客户端据此校正
4. 启动与订阅分离，支持网络闪断后的补播与自动重连
5. 用户主动停止升级为服务端取消，并明确部分回答的后续会话语义
6. App 冷启动可恢复尚未完成的最新回答

恢复保证限定为：**原 API 生成进程仍存活时的客户端网络闪断恢复**。本期不保证 API 进程崩溃或重启后继续原模型生成；该情形由陈旧任务对账标记失败，用户可重新发送。

### 2. HTTP 生命周期：启动、订阅、取消分离

#### 2.1 幂等启动

```http
POST /v1/conversations/:conversationId/messages/stream
Content-Type: application/json
```

请求沿用 `CreateCoachMessageSchema` 的 `CHAT` 字段，并新增客户端生成的 UUID `clientRequestId`。同一次发送的所有启动重试必须复用该值。

响应不再保持 SSE 连接，而是立即返回：

```json
{
  "streamId": "aiRunId",
  "userMessageId": "...",
  "assistantMessageId": "...",
  "status": "RUNNING"
}
```

规则：

- `AiRun` 新增 nullable unique 字段 `clientRequestId`
- `streamId` 直接使用 `AiRun.id`，不再创建第二套会话标识
- 相同 `clientRequestId` 返回已有结果，不重复创建消息、不重复扣除日限、不重复启动模型
- 启动前必须确认 Redis 可用；无法初始化流会话时返回 `503 COACH_STREAM_INFRA_UNAVAILABLE`
- Redis 初始化与数据库事务之间发生竞态失败时必须补偿，不得留下用户可见的永久 `RUNNING` 占位
- 生成任务在 API 进程内脱离订阅连接运行；订阅断开不等于取消生成

#### 2.2 可恢复订阅

```http
GET /v1/conversations/:conversationId/message-streams/:streamId?afterSequence=17
Accept: text/event-stream
```

订阅端点验证当前用户拥有 conversation 与对应 `AiRun`。它先补播 `sequence > afterSequence` 的 Redis 事件，再阻塞等待新事件，直到收到终态或连接关闭。

客户端可以安全地重复 GET；订阅不会创建消息、启动模型或再次计费。

#### 2.3 显式取消

```http
POST /v1/conversations/:conversationId/message-streams/:streamId/cancel
```

取消接口幂等，只允许任务所有者操作。它设置取消标记、触发当前进程中的 `AbortController`，并使生成流程在工具/图节点边界检查取消状态。模型 HTTP `fetch` 必须接收 `AbortSignal`。

停止只阻止尚未发生的后续步骤，不回滚已完成的工具副作用：

- 已写入或删除的长期记忆保持不变
- 已经入队的计划生成、餐照识别任务继续执行
- 已完成的工具轨迹保留
- 尚未开始的工具不得继续调用；进行中的只读 HTTP 工具尽力取消

### 3. 单活与状态机

同一 conversation 同时最多存在一个状态为 `QUEUED` 或 `RUNNING` 的 `COACH_CHAT`。移动端禁用输入只是交互保证，服务端仍必须防御启动超时重试、多设备和并发请求。

使用 PostgreSQL 部分唯一索引保证该约束，而不是“先查询再创建”：

```sql
UNIQUE (conversationId)
WHERE taskType = 'COACH_CHAT' AND status IN ('QUEUED', 'RUNNING')
```

冲突时返回 `409 COACH_STREAM_ALREADY_RUNNING` 及现有 `streamId`，客户端转为订阅已有流。相同 `clientRequestId` 走幂等成功，不返回冲突。不同 conversation 可以并行生成。

终态遵循“先到先得”：

```text
RUNNING ──→ DONE
        ├─→ CANCELLED
        └─→ FAILED
```

所有终态更新必须带 `status = RUNNING` 条件。只有第一个成功更新数据库的路径能发布终态事件：

- 取消先成功：迟到的模型结果不得覆盖部分回答
- 完成先成功：迟到的取消返回当前 `DONE`，客户端展示完整回答
- `done`、`cancelled`、`error` 必须三选一且最多一个

### 4. SSE 事件契约

启动响应取代原 `accepted` SSE 事件；订阅流中的所有业务事件共用一个从 1 开始、严格递增的 `sequence`。

#### 4.1 文本增量

```text
event: delta
data: {"sequence":1,"text":"本次新增片段"}

```

- `text` 只能表示对当前可见回答的追加，不得发送累计全文
- 客户端按序执行 `assistantContent += text`
- `sequence <= lastProcessedSequence` 的重复事件必须忽略

#### 4.2 工具事件

```text
event: tool_start
data: {"sequence":2,"name":"get_weather","label":"查询天气"}

event: tool_end
data: {"sequence":3,"name":"get_weather","ok":true,"summary":"..."}

```

工具事件与文本事件使用同一序号空间，以保证补播时不重放或遗漏工具状态。

#### 4.3 成功终态

```text
event: done
data: {"sequence":4,"lastTextSequence":1,"finalText":"最终完整回答","suggestedActions":[],"toolTrace":[],"usage":{}}

```

- `finalText` 必须存在，是数据库中最终助手消息的权威正文
- 客户端始终比较本地累计正文与 `finalText`；仅在不一致时覆盖，并记录开发日志/观测指标
- 普通校正不向用户展示错误提示

#### 4.4 取消终态

```text
event: cancelled
data: {"sequence":4,"lastTextSequence":1,"finalText":"停止前的部分回答","toolTrace":[]}

```

`finalText` 可以为空。客户端同样执行最终校正，但不展示推荐操作。

#### 4.5 失败终态

```text
event: error
data: {"sequence":4,"code":"...","message":"..."}

```

失败与主动取消的产品语义不同：失败时丢弃已流出的部分回答，助手消息改为 `SYSTEM_NOTICE` 错误提示，`AiRun.status = FAILED`，且该消息不进入下一轮模型上下文。`error` 不携带部分正文，也不自动重试模型调用。

### 5. 真实增量生成与最终快照

#### 5.1 普通聊天

模型适配层继续维护 `{ delta, text, usage }`，但业务层只消费并发送真实 `delta`。最终持久化仍使用完整 `reply`。

#### 5.2 Agent 清洗

Agent 当前对累计原文执行 `stripDsmlMarkup()`，清洗结果可能不是单调追加。服务端维护 `lastVisibleText`：

- 若 `nextVisibleText.startsWith(lastVisibleText)`，发送两者的新增后缀
- 若不满足前缀关系，本轮不发送修正内容，等待后续累计文本
- 流中不新增 `replace`、`reset` 或通用 patch 事件
- `done.finalText` 或 `cancelled.finalText` 负责最终校正所有非追加变化

该约束保证用户不会看到内部 DSML 标记，同时保持增量协议简单。

#### 5.3 服务端合并

为避免把供应商任意切分的 token chunk 直接放大成 Redis/SSE 事件：

- 首个非空文本片段立即发送
- 后续文本按 32ms trailing 窗口合并
- 合并完成后才分配 sequence、写 Redis 并发送
- `tool_start` / `tool_end` 不合并
- 所有终态前必须 flush 待发送文本
- 移动端保留现有 32ms UI 节流，继续限制 Markdown 全量重渲染频率

单次流最多保留约 2,000 个业务事件。到达上限后停止发布中间 `delta`，但继续生成并在终态用 `finalText` 校正；不得通过裁剪仍在运行的流头部来制造无法补播的缺口。

### 6. Redis 事件日志与保留

Redis 是短期传输日志，不是真源。建议使用 Redis Stream：

```text
coach:message-stream:{streamId}:events
```

Redis Stream entry ID 直接使用 `<sequence>-0`，使 `afterSequence` 可映射为 `XREAD` cursor，无需维护另一套序号计数器。单个生成生产者负责严格递增写入。

保留策略：

- 活跃生成期间，每次写事件刷新 TTL 为 5 分钟
- `done` / `cancelled` / `error` 后将 TTL 缩短为 3 分钟
- 3 分钟后不再补播逐字过程，订阅端直接读取数据库终态
- Redis 已过期且数据库仍为 `RUNNING` 时返回 `STREAM_EXPIRED`，不得自动创建第二次生成

Redis 中包含短期回答正文，必须沿用应用 Redis 的访问隔离与日志脱敏要求，不得把事件 payload 写入普通应用日志。

### 7. 数据库权威与终态发布顺序

PostgreSQL 是消息和任务状态的唯一真源，Redis 可以丢弃：

1. 先在数据库事务中更新助手消息与 `AiRun` 终态
2. 再向 Redis 追加终态事件
3. 订阅开始时先读取 `AiRun` 状态
4. 数据库已经终态而 Redis 缺少终态时，根据数据库即时合成终态快照
5. Redis 出现终态而数据库仍为 `RUNNING` 时不得向客户端确认完成；记录异常并重读数据库

`finalText` 永远取自数据库最终保存的助手消息，确保持久化、重连和 UI 校正使用同一份内容。

### 8. 主动取消后的消息与下一轮上下文

取消时保留已经生成的部分回答：

- 有正文：助手消息为 `TEXT`，正文保持纯净；`metadata.taskStatus = CANCELLED`、`incomplete = true`
- 无正文：UI 显示轻量系统气泡“已停止生成”
- UI 在部分回答气泡底部独立显示灰色状态“已停止生成”，不得把状态文案拼入 Markdown 正文
- 不生成 `suggestedActions`，不执行回答完成后的记忆提取或其他完成副作用

`CoachChatHistoryService` 不得把取消回答原样当作完整结论。下一轮构造模型历史时动态包装：

```text
[上一条助手回答被用户主动停止，以下内容不完整。
仅用于理解上下文，不得视为完整建议或既定结论。]
<部分回答>
```

若没有正文，则加入“上一条回答在生成正文前被用户停止”的简短助手标记。这样用户可以继续说“继续”或引用刚才的内容，同时模型知道该回答不完整。

停止后的“继续”始终是一条新的用户消息和新的 `AiRun`；不尝试恢复供应商已终止的采样状态，也不把新文本拼回旧助手消息。

### 9. 移动端重连与会话切换

客户端维护：`streamId`、`lastProcessedSequence`、累计正文、工具活动与重连状态。

自动重连策略：

- 仅网络错误、连接意外关闭和 HTTP 5xx 自动重连
- HTTP 4xx、鉴权最终失败、`STREAM_EXPIRED` 与用户主动取消不自动重连
- 退避为 `0.5s → 1s → 2s → 4s → 8s → 16s`，最多 6 次
- 每次携带最近确认的 `afterSequence`
- 成功收到新业务事件后重连计数清零
- 自动重连耗尽后保留当前正文，展示“连接中断，重新连接”操作
- App 回到前台且任务仍为 `RUNNING` 时立即再次订阅

App 冷启动或页面重建时，如果最新助手消息为 `RUNNING` 且有 `aiRunId`，以该 ID 作为 `streamId` 并从 `afterSequence=0` 重放。无需把流正文或 cursor 持久化到 AsyncStorage。若数据库已经终态，则直接展示数据库消息。

切换或新建 conversation 只取消本地订阅，不取消服务端生成；切回后重新补播。只有明确点击“停止生成”才调用取消接口。交互与协议统一使用“停止”，不使用可恢复原流含义的“暂停”。

### 10. 心跳与时间上限

订阅连接每 5 秒发送一次 SSE 注释心跳：

```text
: ping

```

- 心跳不写 Redis、不占 sequence、不参与重放
- 客户端收到任意字节即刷新最后活动时间
- 连续 15 秒没有任何字节时判定连接失活并重连
- 单次 Coach 生成从启动 `AiRun` 起总上限为 90 秒
- 自动重连与切换前后台不得重置 90 秒总上限
- 达到上限后服务端中止生成并按失败路径处理
- 终态发送后立即关闭订阅并停止心跳

### 11. 观测

一次 `AiRun` 只对应一条 Coach trace；订阅和重连不得创建新的 LLM trace 或重复计费。新增以下指标/字段：

- 首字延迟、完成耗时、取消耗时
- 每轮业务事件数与文本字节数
- 重连次数、补播事件数、重连成功率
- 最终快照校正次数与校正字符数
- `STREAM_EXPIRED`、sequence gap、Redis/数据库终态不一致计数
- 终态类型：`DONE` / `CANCELLED` / `FAILED`

Langfuse flush 继续异步执行，不得阻塞 Redis 写入或 SSE 热路径。

### 12. 验证要求

至少覆盖以下自动化场景：

- 普通聊天多个供应商 chunk 被转换为真实追加 delta
- Agent 清洗结果非前缀时不发送错误增量，最终快照完成校正
- 32ms 合并首包立即发送、终态前 flush
- sequence 对文本、工具和终态严格递增；重复事件被客户端忽略
- 同一 `clientRequestId` 并发启动只创建一组消息与一个 `AiRun`
- 同一 conversation 的不同幂等键无法同时创建两个活跃 CHAT
- 断线后从指定 sequence 补播且不重复正文
- 自动重连退避、耗尽、手动重连与前台恢复
- 冷启动从 0 重放运行中回答
- `done.finalText` 与本地正文一致/不一致两种路径
- 取消与完成竞态只能产生一个终态
- 取消保留部分回答，并以“不完整”标记进入下一轮历史
- 失败丢弃部分回答，错误通知不进入历史
- Redis 终态丢失时从数据库合成权威终态
- Redis 不可用时启动失败且不留下永久运行中的消息
- 心跳、15 秒失活与 90 秒总超时使用 fake timers 验证

### 13. 实施分期

实现按依赖顺序分三层完成，但不长期保留两套生产协议：

| Phase | 交付                                                                                               |
| ----- | -------------------------------------------------------------------------------------------------- |
| P1    | shared 事件契约、真实增量、全局 sequence、32ms 服务端合并、终态最终快照与单元测试                  |
| P2    | Prisma 幂等字段与单活索引、Redis Stream 日志、POST 启动 / GET 订阅 / POST 取消、数据库权威终态     |
| P3    | 移动端增量累加、自动重连、冷启动恢复、会话切换、取消 UI 与取消历史语义；端到端验收后删除旧直连路径 |

### 14. 明确不做

- 兼容累计全文语义的旧客户端或 V1/V2 双协议
- API 进程崩溃后恢复原模型采样
- 通用文本 patch、任意位置替换或 CRDT
- 对已经成功执行的 Agent 工具做补偿回滚
- 失败时保留部分回答
- 将 Redis 作为消息或任务状态真源
- 自动重新调用一次模型来恢复失败回答

## Consequences

**正面**

- 文本传输从累计快照变为真实增量，显著减少长回答的重复带宽
- 网络闪断、App 前后台切换与冷启动可恢复，不会重复创建消息或计费
- 最终快照为协议提供收敛点，即使发生丢片、Agent 清洗非追加变化或客户端局部状态异常，最终 UI 仍与数据库一致
- 启动、订阅和取消职责分离，网络断开不再隐式等价于用户取消
- 取消回答在后续对话中的语义明确：保留上下文，但不得当作完整结论
- 数据库权威、Redis 可丢弃，终态一致性边界清晰

**负面**

- 原本单请求完成的路径变为数据库、Redis Stream、后台生成与订阅四方协作，状态机和测试面明显扩大
- Redis 从通用基础设施变为 Coach 流启动时的硬依赖；不可用时聊天必须明确失败
- API 进程内脱离连接运行的 Promise 仍不能抵御进程崩溃；完整恢复需要未来迁移到独立 worker
- 真实取消需要把 `AbortSignal` 贯穿 LLM client、Agent runner 与部分工具边界
- 最终快照会在正常完成时重复发送一次完整正文，但仅一次，成本远小于每个 chunk 都发送累计全文

**对既有 ADR 的取代**

| ADR       | 状态                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------- |
| 0007      | Coach Conversation、Message、日限与显式 action 继续有效；单请求 SSE 生命周期由本 ADR 取代           |
| 0008 §4.2 | `accepted/delta/done/error` 旧事件语义由本 ADR 的启动响应、全局 sequence、真实 delta 与三种终态取代 |
| 0010      | Langfuse trace 结构继续有效；重连不得创建新 trace，本 ADR 新增传输层观测指标                        |
| 0012      | 记忆工具与混合召回继续有效；取消不得回滚已执行的记忆工具，取消回答不触发完成后副作用                |

## References

- ADR [0007](./0007-coach-conversation-and-chat.md)（Coach 会话与原始流式路径）
- ADR [0008](./0008-coach-agent-tools-and-memory.md)（Agent 工具事件与执行边界）
- ADR [0010](./0010-coach-chat-observability-langfuse.md)（Coach 可观测性）
- ADR [0012](./0012-coach-memory-tooling-and-hybrid-recall.md)（记忆工具与召回）
- `apps/api/src/modules/conversations/`
- `apps/api/src/domain/coach-chat-history.service.ts`
- `packages/ai-core/src/llm/openai-compatible.ts`
- `packages/ai-core/src/chains/coach-chat/stream.ts`
- `packages/ai-core/src/graphs/coach-agent/run-stream.ts`
- `apps/mobile/src/api/client.ts`
- `apps/mobile/src/api/endpoints/coach.ts`
- `apps/mobile/src/features/coach/coach-stream-store.ts`

## Status

Accepted · 2026-09-30
