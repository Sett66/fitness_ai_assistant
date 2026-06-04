# 0006 — Monorepo 内 bare React Native 初始化（Metro / Babel / pnpm）

## Context

M4 需在 `apps/mobile` 落地 bare React Native（**禁止 Expo**），并与 monorepo 内 `@fitness/shared`、`@fitness/ui` 共享契约。根仓库使用 **pnpm workspace + `node-linker=isolated`**（见 `.npmrc`），Metro 默认无法解析 workspace 包与 hoist 后的依赖。

版本基线：**React Native 0.83.9**（≥ 0.82 要求）、**React 19.2**、New Architecture 默认开启。

## Decision

### 1. 初始化方式

使用 `@react-native-community/cli init --version 0.83.9` 生成 `android/`、`ios/` 与 RN 工具链配置，再迁入 `apps/mobile` 并改包名 `com.fitnessai.mobile`。

### 2. Metro（`apps/mobile/metro.config.js`）

- `watchFolders` 指向 monorepo 根目录，使 Metro 监听 `packages/shared`、`packages/ui` 源码变更。
- `resolver.nodeModulesPaths` 同时包含 `apps/mobile/node_modules` 与根 `node_modules`。
- `resolver.disableHierarchicalLookup: true` 配合 pnpm isolated linker。
- `resolver.unstable_enableSymlinks: true` 解析 workspace 软链。

### 3. Babel（`apps/mobile/babel.config.js`）

- 预设：`module:@react-native/babel-preset`。
- 插件：`nativewind/babel`（NativeWind v4）。
- 入口 `global.css` 在 `index.js` 前 import。

### 4. 依赖与 workspace

- 移动端依赖 `@fitness/shared`、`@fitness/ui` 使用 `"workspace:*"`。
- 运行前需 `pnpm --filter @fitness/shared build`（Metro 消费 `dist/`）。
- RN 相关 devDependencies（`@react-native/*`、CLI）仅声明在 `apps/mobile/package.json`，不提升到根。

### 5. 入口与目录

- 根 `index.js` → `src/app/App.tsx`（ARCHITECTURE §3）。
- Feature-based 目录：`src/features/*`、`src/api/*`、`src/store/*`、`src/storage/*`。

### 6. Android 联调 base URL

- 模拟器：`http://10.0.2.2:3000/v1`（映射宿主机 127.0.0.1）。
- 真机：局域网 IP；可通过 `react-native-config` 或 `.env` + babel 注入（M4 用 `@env` 常量文件兜底）。

## Consequences

- **正面**：契约与 UI 组件同仓；Metro 单实例可热更新 workspace 包（shared 需 rebuild dist 或后续改指向 src）。
- **负面**：pnpm isolated 下 Metro 配置比 npm/yarn 多几步；Android 首次构建需本机 JDK + SDK。
- **不做**：Expo、客户端直连 LLM Key（ADR 0003）。

## Status

Accepted · 2026-05-20
