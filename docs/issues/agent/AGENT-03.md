# AGENT-03 — 服务端 Geo 基础设施（高德 + Open-Meteo）

| 字段           | 值                                                   |
| -------------- | ---------------------------------------------------- |
| **Type**       | AFK                                                  |
| **Wave**       | W1                                                   |
| **Blocked by** | [AGENT-01](./AGENT-01.md), [AGENT-02](./AGENT-02.md) |
| **Blocks**     | AGENT-07, AGENT-09                                   |
| **估时**       | 1.5–2 天                                             |

---

## 1. 目标

在 `apps/api` 实现可测试的 **地理与天气客户端**，供后续 `ToolRegistry` 调用。

**本 Issue 不接入 Coach / LangGraph**。验收靠 **单元测试 + mock HTTP**；本地可用真实 Key 手测。

---

## 2. 背景

- Agent 工具 `get_weather`、`geocode_place`、`search_nearby_gyms` 需要稳定、可 mock 的边界
- 密钥仅存服务端（ADR 0003）
- CI 不能依赖外网 Key → 必须 mock 高德/Open-Meteo 响应

### 2.1 高德（已决议）

- 地理编码：文本「上海市」→ `{ lat, lng, city, formattedAddress? }`
- 周边搜索：给定坐标 + 关键词/类型 → 健身房 POI 列表 `{ name, address, distanceM, lat?, lng? }[]`
- 申请： [高德开放平台](https://lbs.amap.com/) Web 服务 Key

### 2.2 Open-Meteo

- 免费、无需 Key
- 文档：https://open-meteo.com/en/docs
- 输入：WGS84 `latitude`/`longitude`；输出：当前/今日降水、气温、风速等

---

## 3. 前置阅读

1. ADR 0008 § 外部服务
2. [`apps/api/src/infra/storage/`](../../../apps/api/src/infra/storage/)（infra 模块组织参考）
3. [`apps/api/src/config/env.schema.ts`](../../../apps/api/src/config/env.schema.ts)

---

## 4. 详细规格

### 4.1 目录结构

```
apps/api/src/infra/geo/
  geo.module.ts
  amap.client.ts
  weather.client.ts
  geo.types.ts          # 内部 DTO，不替代 shared 契约
  amap.client.spec.ts
  weather.client.spec.ts
```

注册到 `AppModule` 或 `DomainModule`；`ToolRegistry`（AGENT-06）再 import。

### 4.2 环境变量

| 变量              | 必填      | 说明                                           |
| ----------------- | --------- | ---------------------------------------------- |
| `AMAP_WEB_KEY`    | 生产/手测 | 高德 Web 服务 Key                              |
| `AMAP_WEB_SECRET` | 按控制台  | 若 Key 类型需要签名，实现签名逻辑并写进 README |

`WeatherClient` 无 Key。

Joi：`AMAP_WEB_KEY` 在 `NODE_ENV=test` 可为空（测试全 mock）；`development` 可选但调用失败时抛可读 `BizException`。

### 4.3 `WeatherClient` 接口

```ts
getForecast(input: {
  lat: number;
  lng: number;
  timezone?: string; // 默认 Asia/Shanghai
}): Promise<{
  summary: string;           // 中文一行摘要，给 LLM 用
  temperatureC: number;
  precipitationMm?: number;
  windSpeedKmh?: number;
  adviceHints: string[];     // 如 ["有雨，建议室内训练"]
}>
```

可选重载：`getForecastByCity(city: string)` 内部先调 `AmapClient.geocode` 再查天气（实现简单可放在 AGENT-07，本 Issue 可只实现坐标版）。

### 4.4 `AmapClient` 接口

```ts
geocode(query: string): Promise<{
  lat: number;
  lng: number;
  city: string;
  formattedAddress?: string;
}>

searchNearbyGyms(input: {
  lat: number;
  lng: number;
  radiusM?: number;  // 默认 3000，最大 5000
  limit?: number;    // 默认 5
}): Promise<Array<{
  name: string;
  address: string;
  distanceM: number;
}>>
```

**POI 类型**：在代码注释与 ADR 中记录实际使用的 `types` 参数；优先「体育休闲服务-健身中心」类编码（实施时查高德文档，勿硬编码错误类型）。

### 4.5 错误处理

- HTTP 非 2xx / 高德 `status !== '1'` → 抛 `BizException` 或内部 `GeoServiceError`，message 中文、**不含**完整 Key
- 日志：`lat/lng` 四舍五入到 2 位小数

### 4.6 测试策略

- 使用 `fetch` mock 或 nock（与仓库现有测试风格一致）
- 每个 client 至少：
  - happy path
  - API 返回错误 status
  - 空 POI 列表

```powershell
pnpm --filter api test
```

### 4.7 可选：开发用 CLI

可在 `scripts/` 加 `geo-smoke.ps1` 调用 Nest standalone 或简单 node 脚本——**非必须**。

---

## 5. 建议改动文件

| 路径                                | 动作             |
| ----------------------------------- | ---------------- |
| `apps/api/src/infra/geo/*`          | 新建             |
| `apps/api/src/app.module.ts`        | import GeoModule |
| `apps/api/src/config/env.schema.ts` | AMAP\_\*         |
| `.env.example`                      | 说明             |
| `apps/api/package.json`             | 若需 `test` 配置 |

**不要改**：`ConversationsService`、`ai-core`。

---

## 6. Acceptance criteria

- [ ] mock 测试在 CI 通过，不请求真实高德
- [ ] 有 Key 时本地可对「上海」geocode + nearby gyms 手测（文档写明命令）
- [ ] Open-Meteo 对固定坐标返回非空 `summary`
- [ ] 日志无完整坐标、无 Key

---

## 7. 验证步骤

```powershell
pnpm --filter api test
# 配置 AMAP_WEB_KEY 后（可选）
pnpm --filter api start:api
# 临时在 controller 或 spec 手测 geocode
```

---

## 8. 不做

- ToolRegistry / LangGraph（AGENT-06/07）
- 移动端定位（AGENT-04）
- Redis 缓存 POI（可记 ADR 后续）

---

## 9. 交付物 / 下游

| 交付物          | 消费者                                         |
| --------------- | ---------------------------------------------- |
| `AmapClient`    | AGENT-07 `geocode_place`, `search_nearby_gyms` |
| `WeatherClient` | AGENT-07 `get_weather`                         |
| `GeoModule`     | AGENT-06 ToolRegistry DI                       |
