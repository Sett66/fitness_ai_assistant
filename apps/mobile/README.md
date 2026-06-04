# @fitness/mobile

bare React Native 0.83.9（Android 优先；保留 iOS 代码但不构建）。

> **状态：M4 MVP + Coach（ADR 0007）**

## 硬约束

- **严禁 Expo** 任何包
- AI 走 HTTP（Coach CHAT 为 **SSE 流式**；计划/识图为任务投递 + 轮询），禁止客户端直连 LLM Key（ADR 0003）
- 契约以 `@fitness/shared` Zod 为准

## 本地启动

```powershell
# 根目录
pnpm install
pnpm --filter @fitness/shared build
pnpm --filter @fitness/db build

# API（另开终端）
pnpm --filter api start:worker
pnpm --filter api start:api

# Metro + Android
pnpm --filter @fitness/mobile start
pnpm --filter @fitness/mobile android
```

Android 模拟器 API 地址：`http://10.0.2.2:3000/v1`（见 `src/env.ts`）。MinIO 预签名 URL 由 API 按 `clientPublicEndpoint` 签发，**客户端不可改写 host**（会破坏签名）。

### 常见问题

| 现象                                   | 原因 / 处理                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 相册选图后 `Network request failed`    | 已修复：XHR 读取 `content://` URI                                                                                         |
| 上传 403 `SignatureDoesNotMatch`       | 预签名 URL 不能改 host；Android 模拟器会自动传 `clientPublicEndpoint=http://10.0.2.2:9000` 给 API 签发                    |
| 识别任务 FAILED「download multimodal」 | Qwen 需公网可访问图片；开发期在 `apps/api/.env` 设 `S3_PUBLIC_ENDPOINT`（模拟器 `http://10.0.2.2:9000`，真机用局域网 IP） |
| 真机连不上 API                         | 把 `src/env.ts` 中 base URL 改为电脑局域网 IP（如 `http://192.168.x.x:3000/v1`）                                          |
| Coach 流式卡顿                         | 长回复 Markdown 全量重渲染；非 SSE 节流                                                                                   |

## 目录

见 `docs/ARCHITECTURE.md` §3 与 ADR [`0006-monorepo-react-native.md`](../../docs/adr/0006-monorepo-react-native.md)、[`0007-coach-conversation-and-chat.md`](../../docs/adr/0007-coach-conversation-and-chat.md)。

## 功能

- [x] Auth（注册 / 登录 / Keychain + 401 refresh）
- [x] 档案与力量等级
- [x] 仪表盘（今日营养 + 训练概览；**无**首页体重卡片）
- [x] 训练计划（AI 生成 + 列表 / 详情）
- [x] 训练打卡 + 组间计时器 + MMKV 草稿
- [x] 餐照识别（presign 上传 + MEAL_VISION 轮询）
- [x] 饮食日志 + 手动记餐（`ManualMealSheet`）
- [x] Onboarding 末步生成训练 + 饮食双计划
- [x] **Coach Tab**（多会话、SSE 流式对话、Markdown 表格、生成计划/识图/记餐）
- [x] Social Tab 占位
- [x] `@fitness/ui` 基础组件 + NativeWind

## 依赖版本

- react-native **0.83.9**（≥ 0.82）
- react **19.2.0**
