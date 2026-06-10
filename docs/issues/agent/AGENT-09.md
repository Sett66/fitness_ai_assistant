# AGENT-09 — 用户最近位置 HTTP API（社区预热）

| 字段           | 值                                                   |
| -------------- | ---------------------------------------------------- |
| **Type**       | AFK                                                  |
| **Wave**       | W3（可与 07/08 并行）                                |
| **Blocked by** | [AGENT-02](./AGENT-02.md), [AGENT-03](./AGENT-03.md) |
| **Blocks**     | 无（M6 社区消费）                                    |
| **估时**       | 1 天                                                 |

---

## 1. 目标

提供本人最近位置的 **读写 HTTP API**，语义与 Phase 2 [`PartnerProfile`](../../../packages/shared/src/schemas/phase2/partner.ts)（`city`, `lng`, `lat`）对齐，供：

- Coach 在获得 GPS 后可选持久化
- M6 训练伙伴匹配复用，避免重复造轮子

**本 Issue 不实现社区匹配 UI**。

---

## 2. 背景

- ADR 0008 推荐 `UserLocationSnapshot` 表（可保留历史）而非仅 Profile 单字段
- [`PartnerProfile`](../../../packages/db/prisma/schema.prisma) 已存在 schema，但 **无** 开放 API
- AGENT-04 仅在 `AiRun.inputJson` 存单次 `locationContext`

---

## 3. 前置阅读

1. ADR 0008 § 位置数据
2. [AGENT-02](./AGENT-02.md) `LocationContextSchema`
3. [`apps/api/src/modules/users/`](../../../apps/api/src/modules/users/) 模块结构

---

## 4. 详细规格

### 4.1 数据模型（推荐）

```prisma
model UserLocationSnapshot {
  id        String   @id @default(cuid())
  userId    String
  lat       Float
  lng       Float
  city      String?  @db.VarChar(64)
  source    LocationSource  // GPS | MANUAL | GEOCODE
  createdAt DateTime @default(now())

  user User @relation(...)
  @@index([userId, createdAt])
}

enum LocationSource {
  GPS
  MANUAL
  GEOCODE
}
```

**读取策略**：`GET /users/me/location` 返回该用户 **最新一条** snapshot（`orderBy createdAt desc`）。

若 ADR 0008 已选定 Profile 扩展方案，按 ADR 实施并在本 PR 更新文档。

### 4.2 HTTP API

| 方法 | 路径                    | Body                       | 响应                           |
| ---- | ----------------------- | -------------------------- | ------------------------------ |
| PUT  | `/v1/users/me/location` | `UpsertUserLocationSchema` | `UserLocationResponse`         |
| GET  | `/v1/users/me/location` | —                          | `UserLocationResponse \| null` |

`UpsertUserLocationSchema`（shared）：

```ts
{
  lat: number;
  lng: number;
  city?: string;
  source: 'GPS' | 'MANUAL' | 'GEOCODE';
}
```

`UserLocationResponse`：同上 + `updatedAt`（最新 snapshot 的 `createdAt`）。

鉴权：`JwtAuthGuard`，仅操作 `user.userId`。

### 4.3 可选：逆地理编码

若 PUT 时无 `city` 仅有 lat/lng，可调用 [AGENT-03] `AmapClient` 反查城市并写入 —— **可选**，不做不阻塞。

### 4.4 移动端集成（可选本 Issue）

在 AGENT-04 `getLocationContext` 成功后：

```ts
await apiFetch('/users/me/location', { method: 'PUT', body: { ...ctx, source: 'GPS' } });
```

失败静默，不阻塞 CHAT。

### 4.5 隐私

- 无 `GET /users/:id/location`
- Swagger 注明：仅本人可读
- 日志坐标脱敏

---

## 5. 建议改动文件

| 路径                                             | 动作                 |
| ------------------------------------------------ | -------------------- |
| `packages/db/prisma/schema.prisma`               | UserLocationSnapshot |
| `packages/shared/src/schemas/user-location.ts`   | 新建                 |
| `apps/api/src/modules/users/users.controller.ts` | 端点                 |
| `apps/api/src/modules/users/users.service.ts`    | 逻辑                 |
| `apps/mobile/src/api/endpoints/users.ts`         | 可选 PUT             |

---

## 6. Acceptance criteria

- [ ] PUT 后 GET 返回一致 lat/lng/city/source
- [ ] 多次 PUT 产生多条 snapshot；GET 取最新
- [ ] 未 PUT 时 GET 返回 `null` 或 404（在 shared 约定一种）
- [ ] `pnpm typecheck` + Swagger 可见

---

## 7. 验证步骤

```powershell
# 登录拿 token
Invoke-RestMethod -Uri http://127.0.0.1:3000/v1/users/me/location -Method PUT -Headers @{Authorization="Bearer ..."} -Body '{"lat":31.2,"lng":121.5,"city":"上海","source":"MANUAL"}' -ContentType application/json
Invoke-RestMethod -Uri http://127.0.0.1:3000/v1/users/me/location -Headers @{Authorization="Bearer ..."}
```

---

## 8. 不做

- PostGIS / 距离匹配（M6）
- 公开他人位置
- 后台轨迹追踪

---

## 9. 交付物 / 下游

| 交付物                | 消费者                               |
| --------------------- | ------------------------------------ |
| `GET/PUT me/location` | M6 PartnerProfile 同步策略           |
| Snapshot 历史         | 分析用户常出差城市（记忆抽取可参考） |
