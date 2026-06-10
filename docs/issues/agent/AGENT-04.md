# AGENT-04 — 移动端定位模块与 CHAT 上报

| 字段           | 值                        |
| -------------- | ------------------------- |
| **Type**       | AFK                       |
| **Wave**       | W1                        |
| **Blocked by** | [AGENT-02](./AGENT-02.md) |
| **Blocks**     | AGENT-07                  |
| **估时**       | 1.5–2 天                  |

---

## 1. 目标

实现 **Android 优先** 的定位能力，并在用户发 Coach **CHAT** 时可附带 `LocationContext`（契约见 [AGENT-02](./AGENT-02.md)）到 API。

**本 Issue 不要求 Agent 消费位置**；API 将数据写入 `AiRun.inputJson` 与/或 `Message.metadata` 备后续 AGENT-06/07 使用。

---

## 2. 背景

- 模拟器可通过 Extended Controls 设 GPS；真机需运行时权限
- 当前 [`AndroidManifest.xml`](../../../apps/mobile/android/app/src/main/AndroidManifest.xml) **仅有** `INTERNET`、`CAMERA`
- iOS `Info.plist` 已有 `NSLocationWhenInUseUsageDescription` 占位，本 Issue **Android 必做**，iOS 对齐权限文案即可
- Coach 发消息入口：[`apps/mobile/src/api/endpoints/coach.ts`](../../../apps/mobile/src/api/endpoints/coach.ts) 的 `apiStreamSSE` 路径

---

## 3. 前置阅读

1. [AGENT-02](./AGENT-02.md) — `LocationContextSchema`、`CreateCoachMessageSchema`
2. [`apps/mobile/src/api/endpoints/coach.ts`](../../../apps/mobile/src/api/endpoints/coach.ts)
3. [`apps/mobile/src/features/coach/CoachScreen.tsx`](../../../apps/mobile/src/features/coach/CoachScreen.tsx)（或 ChatComposer）

---

## 4. 详细规格

### 4.1 依赖选型

推荐（与 RN 0.83 兼容为准）：

- `@react-native-community/geolocation`
- `react-native-permissions` **或** RN 内置 `PermissionsAndroid`（二选一，文档说明）

在 [`apps/mobile/package.json`](../../../apps/mobile/package.json) 添加依赖后执行 `pnpm install`；Android 需重新编译。

### 4.2 Android 清单

`apps/mobile/android/app/src/main/AndroidManifest.xml` 增加：

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```

### 4.3 新模块 `apps/mobile/src/features/location/`

| 文件                    | 职责                                             |
| ----------------------- | ------------------------------------------------ |
| `getLocationContext.ts` | 单次获取 GPS；超时 10s；失败返回 `null`          |
| `useLocationConsent.ts` | MMKV 记录用户是否看过说明；`requestPermission()` |
| `location-labels.ts`    | 中文文案：权限说明、拒绝提示                     |
| `index.ts`              | 导出                                             |

**`getLocationContext` 返回**（对齐 shared Zod）：

```ts
{
  lat, lng, accuracyM?, city?: undefined, capturedAt: new Date().toISOString()
}
```

`city` 可留空（逆地理编码在服务端 AGENT-03/07 做）。

### 4.4 何时请求定位

**懒加载**（推荐，减少打扰）：

- 用户发送 CHAT 且消息匹配简单启发式（含「天气」「出门」「户外」「附近」「出差」等）**或** MMKV 中 `coachLocationOptIn === true`
- 否则不传 `locationContext`

启发式可放在 `shouldAttachLocation(userText: string): boolean`，单元测试 3–5 条 case。

若用户拒绝权限：**不传** `locationContext`，不阻塞发送；可选 Toast「未授权位置，可说明城市名」。

### 4.5 集成 Coach 发送

在构造 `CreateCoachMessageInput` 处（coach endpoint 或 CoachScreen）：

```ts
const body: CreateCoachMessageInput = {
  action: 'CHAT',
  content: text,
  timezoneOffsetMinutes: DEFAULT_TIMEZONE_OFFSET_MINUTES,
  locationContext: ctx ?? undefined,
};
```

`CreateCoachMessageSchema.parse(body)` 必须通过。

### 4.6 API 存储（最小改动）

修改 [`ConversationsService.postMessageStream`](../../../apps/api/src/modules/conversations/conversations.service.ts)：

- `userMessage.metadata` 增加 `locationContext`（若有）
- `aiRun.inputJson` 增加 `locationContext`（若有）

**不要**在本 Issue 改 LLM prompt。

### 4.7 用户说明 UI

任选其一（最小）：

- 「我的」设置页增加「位置权限」说明段落 + 跳转系统设置按钮
- 或 Coach 首次触发定位前 `Alert` 说明用途（健身天气与出差找馆）

文案强调：仅用于训练建议，不上传精确坐标给其他用户（与 AGENT-09 一致）。

---

## 5. 建议改动文件

| 路径                                                   | 动作                      |
| ------------------------------------------------------ | ------------------------- |
| `apps/mobile/src/features/location/*`                  | 新建                      |
| `apps/mobile/android/app/src/main/AndroidManifest.xml` | 权限                      |
| `apps/mobile/package.json`                             | 依赖                      |
| `apps/mobile/src/api/endpoints/coach.ts`               | 附带 locationContext      |
| `apps/api/.../conversations.service.ts`                | 持久化 metadata/inputJson |
| `apps/mobile/src/features/profile/` 或 settings        | 说明 UI                   |

---

## 6. Acceptance criteria

- [ ] 授权后：发 CHAT（含「天气」）→ 服务端 `AiRun.inputJson` 含 `locationContext.lat/lng`
- [ ] 拒绝权限：CHAT 仍成功，无 `locationContext`
- [ ] `pnpm typecheck` 通过
- [ ] Android 模拟器手测通过（设置模拟坐标）

---

## 7. 验证步骤

```powershell
pnpm --filter mobile android
# 模拟器 Extended Controls -> Location -> 设上海坐标
# Coach 发送「今天出门跑步要注意什么」
# 查 DB ai_runs.input_json 或 API 日志
```

---

## 8. 不做

- 调用 `PUT /users/me/location`（AGENT-09，可选在本 Issue 末尾加 hooks）
- Agent 根据位置调天气（AGENT-07）
- 后台持续定位

---

## 9. 交付物 / 下游

| 交付物                            | 消费者                    |
| --------------------------------- | ------------------------- |
| `getLocationContext()`            | AGENT-07 天气工具输入     |
| `AiRun.inputJson.locationContext` | AGENT-06 CoachAgentRunner |
| 权限 UX                           | 产品合规                  |
