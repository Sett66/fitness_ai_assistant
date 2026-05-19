# @fitness/mobile

bare React Native（Android 优先；保留 iOS 代码但不构建）。

> **状态：M1 占位**
>
> 真实实现见 **M4**。

## 硬约束

- **严禁 Expo 任何包**（HANDOFF §4 第 6 坑）。本项目走 bare RN 路线
- 不要在 M1 阶段 `npx @react-native-community/cli init`（HANDOFF §4 第 7 坑）。
  RN 在 monorepo 内初始化需要单独调 metro / babel，到时候单开一份 ADR
- `tsconfig.json` 暂时 `"types": []` 占位，**M4 装 RN 依赖后**改回 `["react-native"]`

## 计划目录结构（M4 落地）

详见 `docs/ARCHITECTURE.md` §3.

```
src/
├── app/                     # 入口 + 全局 Provider 装配（App.tsx / providers.tsx / navigation/）
├── features/                # feature-based 业务模块
│   ├── auth/
│   ├── profile/
│   ├── workout/             # 打卡 + 计时器
│   ├── plan/                # 训练 + 饮食计划
│   ├── nutrition/           # 食物识别 + 饮食日志
│   ├── dashboard/
│   └── (phase2)/            # social / report 占位
├── api/                     # fetch wrapper + TanStack Query hooks
├── store/                   # Zustand stores
├── storage/                 # MMKV + Keychain 封装
├── theme/                   # NativeWind theme tokens
├── lib/                     # 工具函数
└── i18n/                    # 当前仅引 packages/shared 中文
```

## M4 依赖清单（届时添加，**M1 不要装**）

- `react` / `react-native` (≥ 0.76 with New Architecture)
- `nativewind` + `tailwindcss`
- `@react-navigation/{native,native-stack,bottom-tabs}`
- `@tanstack/react-query`
- `zustand`
- `react-native-mmkv` / `react-native-keychain`
- `react-hook-form` + `@hookform/resolvers`
- `@sentry/react-native`
- `react-native-reusables` (rn-primitives)
- `lucide-react-native`

## TODO（M4）

- [ ] `npx @react-native-community/cli init` 初始化（**先写 ADR 说明 monorepo 内 RN 初始化的 metro / babel 改动**）
- [ ] Auth 流（注册 / 登录 / refresh）
- [ ] 档案填写
- [ ] 训练打卡 + 组间计时器（含离线兜底）
- [ ] 计划展示
- [ ] 食物识别 UI（拍照 / 选图 / 结果回填）
- [ ] 仪表盘
- [ ] Sentry 接入
