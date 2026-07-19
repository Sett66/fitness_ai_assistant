# @fitness/mobile

bare React Native 0.83.9（Android 优先；保留 iOS 代码但不构建）。

> **状态：M4 MVP + Coach（ADR 0007）+ Agent（ADR 0008）· M5 精简关闭（API 配置注入）**

## 硬约束

- **严禁 Expo** 任何包
- AI 走 HTTP（Coach CHAT 为 **SSE 流式**；计划/识图为任务投递 + 轮询），禁止客户端直连 LLM Key（ADR 0003）
- 契约以 `@fitness/shared` Zod 为准
- **勿把个人局域网 IP 写进源码**；真机地址只放本目录 `.env`（已 gitignore）

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

### 真机联调（API / MinIO 地址）

| 场景               | 怎么做                                                                         |
| ------------------ | ------------------------------------------------------------------------------ |
| **Android 模拟器** | 可不建 `.env`；默认 API `http://10.0.2.2:3000/v1`，存储 `http://10.0.2.2:9000` |
| **真机**           | 复制 `.env.example` → `.env`，填电脑局域网 IP（见下）                          |

```powershell
cd apps\mobile
copy .env.example .env
# 编辑 .env，例如：
#   API_BASE_URL=http://192.168.1.10:3000/v1
#   STORAGE_PUBLIC_ENDPOINT=http://192.168.1.10:9000
```

查本机 IP（PowerShell）：`(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' }).IPAddress`

**改完 `.env` 必须重启 Metro**（环境变量在 Babel 打包时内联；热更新不会重读）。

实现要点：

- `load-env.js`：Metro / Babel 启动时读 `.env` → `process.env`
- `babel-plugin-transform-inline-environment-variables`：把 `API_BASE_URL` / `STORAGE_PUBLIC_ENDPOINT` 打进 JS
- `src/dev-config.ts` / `src/env.ts`：有覆盖用覆盖，否则平台默认

MinIO 预签名 URL 由 API 按 `clientPublicEndpoint` 签发，**客户端不可改写 host**（会破坏签名）。

### 常见问题

| 现象                                   | 原因 / 处理                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 相册选图后 `Network request failed`    | 已修复：XHR 读取 `content://` URI                                                                                              |
| 上传 403 `SignatureDoesNotMatch`       | 预签名 URL 不能改 host；模拟器会自动传 `clientPublicEndpoint=http://10.0.2.2:9000`；真机在 `.env` 设 `STORAGE_PUBLIC_ENDPOINT` |
| 识别任务 FAILED「download multimodal」 | Qwen 需公网可访问图片；开发期在 `apps/api/.env` 设 `S3_PUBLIC_ENDPOINT`（模拟器 `10.0.2.2:9000`，真机用局域网 IP）             |
| 真机连不上 API                         | 检查 `apps/mobile/.env` 的 `API_BASE_URL`；手机与电脑同一 Wi‑Fi；Windows 防火墙放行 3000；改后**重启 Metro**                   |
| 改了 `.env` 仍连旧地址                 | Metro 未重启；停掉后重新 `pnpm --filter mobile start`                                                                          |
| Coach 流式卡顿                         | 长回复 Markdown 全量重渲染；非 SSE 节流                                                                                        |

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
