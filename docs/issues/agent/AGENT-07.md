# AGENT-07 — 天气与出差健身房工具（端到端）

| 字段           | 值                                                                              |
| -------------- | ------------------------------------------------------------------------------- |
| **Type**       | AFK                                                                             |
| **Wave**       | W3                                                                              |
| **Blocked by** | [AGENT-03](./AGENT-03.md), [AGENT-04](./AGENT-04.md), [AGENT-06](./AGENT-06.md) |
| **Blocks**     | AGENT-10                                                                        |
| **估时**       | 2–3 天                                                                          |

---

## 1. 目标

在 AGENT-06 的 `ToolRegistry` 与 Graph 中注册 **3 个 Geo 工具**，并完成 **移动端工具状态 UI**，实现产品核心场景：

1. 「今天出门训练要注意什么」→ **真实天气** + 训练建议
2. 「下周去上海出差，周边有健身房吗」→ **地理编码** + **POI 列表**

---

## 2. 背景

| 工具                 | 依赖                                                                           |
| -------------------- | ------------------------------------------------------------------------------ |
| `get_weather`        | [AGENT-03] WeatherClient；输入来自 [AGENT-04] `locationContext` 或用户文本城市 |
| `geocode_place`      | [AGENT-03] AmapClient.geocode                                                  |
| `search_nearby_gyms` | [AGENT-03] AmapClient.searchNearbyGyms                                         |

**幻觉约束**：Prompt 必须写清——未调用工具前不得声称具体气温/降水/健身房名称。

---

## 3. 前置阅读

1. [AGENT-03](./AGENT-03.md)、[AGENT-04](./AGENT-04.md)、[AGENT-06](./AGENT-06.md)
2. [`apps/mobile/src/features/coach/coach-stream-store.ts`](../../../apps/mobile/src/features/coach/coach-stream-store.ts)
3. [`apps/mobile/src/api/endpoints/coach.ts`](../../../apps/mobile/src/api/endpoints/coach.ts) SSE 解析

---

## 4. 详细规格

### 4.1 工具参数与返回（ToolRegistry）

#### `get_weather`

```ts
input: {
  lat?: number;
  lng?: number;
  city?: string;  // 无坐标时用 geocode 或让用户层追问
}
observation: string  // 中文结构化，含温度、降水、风力、adviceHints
```

逻辑：

1. 若 `ctx.locationContext` 有 lat/lng → 直接用
2. 否则若 input.city 或能从用户句抽取城市 → `AmapClient.geocode`
3. 否则返回 observation：`需要城市名或定位权限`（让 LLM 追问用户）

#### `geocode_place`

```ts
input: {
  query: string;
} // 「上海」「杭州市西湖区」
observation: {
  (lat, lng, city, formattedAddress);
}
```

#### `search_nearby_gyms`

```ts
input: { lat: number; lng: number; radiusM?: number }
observation: { gyms: [{ name, address, distanceM }] }
```

可先 `geocode_place` 再 `search_nearby_gyms`（多轮 ReAct）。

### 4.2 Graph / Prompt 更新

- `tools-schema.ts` 增加 3 个 function definition（中文 description）
- System prompt 增加：
  - 户外训练/天气问题 → 优先 `get_weather`
  - 出差/陌生城市健身房 → `geocode_place` + `search_nearby_gyms`
  - **禁止编造**未在 observation 中出现的 POI/气温

### 4.3 工具日限

按 ADR 0008（若未写则默认）：

| 工具                 | 日限/用户 |
| -------------------- | --------- |
| `get_weather`        | 10        |
| `geocode_place`      | 20        |
| `search_nearby_gyms` | 10        |

实现：`ai_runs` 聚合当日 `toolTrace` 或 Redis 计数；超限 observation：`今日该工具次数已用完`。

### 4.4 移动端 UI

#### SSE 解析扩展 [`coach.ts`](../../../apps/mobile/src/api/endpoints/coach.ts)

解析 `event: tool_start` / `tool_end`，写入 `coach-stream-store`。

#### 展示

在 [`ChatMessageList`](../../../apps/mobile/src/features/coach/components/ChatMessageList.tsx) 或 pending assistant 气泡上方：

- `tool_start`：显示 `label` 或映射表，如 `get_weather` → 「正在查询天气…」
- `tool_end`：成功可短暂显示「完成」后折叠；失败显示 `summary`

**不要**阻塞 `delta` 渲染。

#### 工具名中文映射

`packages/shared` 或 mobile `coach-tool-labels.ts`：

```ts
get_weather -> 查询天气
geocode_place -> 解析地点
search_nearby_gyms -> 搜索附近健身房
```

---

## 5. 建议改动文件

| 路径                                                      | 动作                |
| --------------------------------------------------------- | ------------------- |
| `apps/api/src/domain/agent/tool-registry.service.ts`      | 3 工具              |
| `packages/ai-core/src/graphs/coach-agent/tools-schema.ts` | 注册                |
| `packages/ai-core/src/prompts/coach-system.ts`            | Agent 天气/POI 规则 |
| `apps/mobile/src/api/endpoints/coach.ts`                  | SSE                 |
| `apps/mobile/src/features/coach/coach-stream-store.ts`    | tool 状态           |
| `apps/mobile/src/features/coach/components/*`             | UI                  |

---

## 6. Acceptance criteria

- [ ] 模拟器设上海坐标 + 问户外训练 → 回复含气温/降水/风至少一项（真实 Key 或 mock 集成测）
- [ ] 「出差上海有什么健身房」→ 回复含 ≥1 馆名或地址
- [ ] 无定位且不说城市 → 助手追问城市而非瞎编天气
- [ ] 日限触发 → 用户可读提示，HTTP 200，SSE 正常结束
- [ ] 移动端可见「正在查询天气…」类状态

---

## 7. 验证步骤

```powershell
# apps/api/.env: COACH_AGENT_ENABLED=true, AMAP_WEB_KEY=...
pnpm --filter mobile android
# 场景 1：GPS + 天气
# 场景 2：文本出差上海健身房
# 场景 3：关闭定位不提城市
```

---

## 8. 不做

- `enqueue_plan_generate`（AGENT-08）
- 地图展示/WebView
- 缓存 POI 到自有 DB

---

## 9. 交付物 / 下游

| 交付物              | 消费者            |
| ------------------- | ----------------- |
| 3 个 Geo 工具       | AGENT-10 验收脚本 |
| 移动端 tool UI 模式 | 后续更多工具复用  |
