# AGENT-06 — Agent 核心：LangGraph ReAct + ToolRegistry 骨架

| 字段           | 值                                                   |
| -------------- | ---------------------------------------------------- |
| **Type**       | AFK                                                  |
| **Wave**       | W2                                                   |
| **Blocked by** | [AGENT-02](./AGENT-02.md), [AGENT-05](./AGENT-05.md) |
| **Blocks**     | AGENT-07, AGENT-08                                   |
| **估时**       | 3–4 天                                               |

---

## 1. 目标

接通 **第一条完整 Agent 链路**：`COACH_AGENT_ENABLED=true` 时，Coach SSE 走 **LangGraph ReAct**，且至少实现 **1 个工具** `get_user_fitness_snapshot`。

演示句：「根据我今天的摄入，晚餐怎么吃」→ 模型调用 snapshot → 流式中文回答；`Message.metadata.toolTrace` 有记录。

`COACH_AGENT_ENABLED=false` 时 **零回归**。

---

## 2. 背景

### 2.1 现有流式路径

[`postMessageStream`](../../../apps/api/src/modules/conversations/conversations.service.ts) 流程：

1. 创建 USER/ASSISTANT(pending) Message + `AiRun` status `RUNNING`
2. `emit('accepted')`
3. `loadCoachChatHistory` + `userContext.build`
4. `for await` `runCoachChatStream` → `emit('delta')`
5. 更新 Message、`AiRun` → `emit('done')` 含 `suggestedActions`

### 2.2 架构决策（ADR 0008）

- **Graph** 在 `packages/ai-core`
- **工具执行** 在 `apps/api`（可访问 Prisma、Queue、Geo）
- 模式：ai-core 导出 `createCoachAgentGraph({ invokeTool })`，API 注入 `invokeTool`

---

## 3. 前置阅读

1. ADR 0008 全文
2. [AGENT-02](./AGENT-02.md) SSE 事件 schema
3. [AGENT-05](./AGENT-05.md) memory 注入
4. [`packages/ai-core/src/chains/coach-chat/stream.ts`](../../../packages/ai-core/src/chains/coach-chat/stream.ts)
5. LangGraph.js ReAct 文档（npm `@langchain/langgraph`）

---

## 4. 详细规格

### 4.1 依赖

`packages/ai-core/package.json`：

```json
"@langchain/core": "^0.3.x",
"@langchain/langgraph": "^0.2.x"
```

版本与 Node 22 兼容；`pnpm install` 后全仓 typecheck。

### 4.2 ai-core 结构

```
packages/ai-core/src/graphs/coach-agent/
  state.ts           # messages, toolCalls, observations, reply, usage
  tools-schema.ts    # OpenAI function defs from CoachToolName（本 Issue 仅 1 个工具）
  graph.ts           # StateGraph: agent -> tools -> agent ...
  run-stream.ts      # AsyncGenerator 适配 SSE delta
  index.ts
```

**State 建议字段**：

- `messages: ChatMessage[]`
- `toolTrace: CoachToolTraceItem[]`（累计）
- `iteration: number`（防死循环）

**ReAct 上限**：`MAX_TOOL_ITERATIONS = 5`（常量，与 ADR 一致）

### 4.3 工具 schema（本 Issue 仅注册 1 个）

`get_user_fitness_snapshot`：

- 参数：`{}` 或可选 `{ timezoneOffsetMinutes?: number }`
- 描述（中文）：获取用户档案、今日营养、活跃计划摘要

其余工具在 AGENT-07/08 注册，但 `tools-schema.ts` 应设计为**可追加数组**。

### 4.4 API：`ToolRegistry`

`apps/api/src/domain/agent/tool-registry.service.ts`

```ts
async execute(name: CoachToolName, input: unknown, ctx: ToolContext): Promise<unknown>
```

`ToolContext` 含：`userId`, `timezoneOffsetMinutes`, `locationContext?`, `conversationId?`

本 Issue 实现分支：

- `get_user_fitness_snapshot` → `UserContextService.build` + 可选 `AgentMemoryService.listForPrompt` 合并为 JSON 摘要（给 LLM 的 observation 字符串）

未实现工具调用应抛明确错误（供 Graph 转成 observation 错误信息）。

### 4.5 API：`CoachAgentRunner`

`apps/api/src/domain/agent/coach-agent.runner.ts`

输入对齐现有：

```ts
{
  latestUserText: string;
  history: CoachChatHistoryItem[];
  userContext: UserAiContext;
  memoryFacts: AgentMemoryFact[];
  locationContext?: LocationContext;
  timezoneOffsetMinutes: number;
}
```

输出：AsyncGenerator 事件：

| 事件                                                           | 说明         |
| -------------------------------------------------------------- | ------------ |
| `{ type: 'delta', text }`                                      | 累积全文流式 |
| `{ type: 'tool_start', name, label? }`                         |              |
| `{ type: 'tool_end', name, ok, summary? }`                     |              |
| `{ type: 'done', reply, suggestedActions?, usage, toolTrace }` |              |

**流式实现策略**（二选一，ADR 未限时推荐 B）：

- A. 仅在最终节点 `streamText` 一次（工具阶段非流式）
- B. 最终回答用现有 `client.streamText`（与现网一致）

本 Issue 至少保证 **最终回答** 有 `delta` 事件。

`suggestedActions`：可复用 `inferSuggestedActions`（从 stream.ts 抽出到 shared 模块避免重复）。

### 4.6 切换 `postMessageStream`

```ts
if (this.agentConfig.isCoachAgentEnabled()) {
  const runner = this.coachAgentRunner.run(...);
  for await (const ev of runner) {
    if (ev.type === 'delta') emit('delta', { text: ev.text });
    if (ev.type === 'tool_start') emit('tool_start', ...);
    ...
  }
} else {
  // 现有 runCoachChatStream
}
```

`emit` 新事件需在 controller 的 SSE 序列化处注册 event name（`event: tool_start`）。

### 4.7 持久化

与现网一致，额外：

- `AiRun.outputJson`: `{ reply, suggestedActions, toolTrace }`
- `Message.metadata`: `{ taskStatus: 'DONE', taskType: 'COACH_CHAT', suggestedActions, toolTrace }`

### 4.8 Prompt

扩展 [`coach-system.ts`](../../../packages/ai-core/src/prompts/coach-system.ts) Agent 版：

- 可用工具列表及何时调用
- 有 `get_user_fitness_snapshot` 结果时不得编造摄入数字
- 本 Issue **不涉及** 天气/POI 文案

---

## 5. 建议改动文件

| 路径                                                          | 动作                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------- |
| `packages/ai-core/package.json`                               | langgraph deps                                        |
| `packages/ai-core/src/graphs/coach-agent/*`                   | 新建                                                  |
| `apps/api/src/domain/agent/*`                                 | Registry + Runner                                     |
| `apps/api/src/modules/conversations/conversations.service.ts` | 分支                                                  |
| `conversations.controller.ts`                                 | SSE 新 event                                          |
| `apps/mobile/.../coach.ts`                                    | **可选** 本 Issue 仅 API；移动端忽略未知 event 不报错 |

移动端 SSE 解析：未知 event 应 ignore（若 06 未改 mobile，须保证不 crash）。

---

## 6. Acceptance criteria

- [ ] `COACH_AGENT_ENABLED=false`：`m4-acceptance.ps1` 通过
- [ ] `COACH_AGENT_ENABLED=true`：问摄入相关 → `toolTrace` 含 `get_user_fitness_snapshot` 且 `ok: true`
- [ ] SSE 有 `tool_start`/`tool_end`（可用 curl 或日志验证）
- [ ] 超过 5 轮 tool 时优雅终止（错误信息或截断）
- [ ] `pnpm typecheck` 通过

---

## 7. 验证步骤

```powershell
# .env: COACH_AGENT_ENABLED=true
pnpm --filter shared build
pnpm --filter ai-core build
pnpm --filter api start:worker
pnpm --filter api start:api
# Coach CHAT: 「我今日还能吃多少碳水」
# 检查 messages.metadata.toolTrace
```

---

## 8. 不做

- `get_weather` 等 Geo 工具（AGENT-07）
- `enqueue_*`（AGENT-08）
- 删除 `runCoachChatStream`（保留回退）

---

## 9. 交付物 / 下游

| 交付物                        | 消费者             |
| ----------------------------- | ------------------ |
| `CoachAgentRunner` + SSE 事件 | AGENT-07/08 加工具 |
| `ToolRegistry.execute` 扩展点 | 07 Geo、08 Queue   |
| Graph streaming 适配          | AGENT-10 验收      |
