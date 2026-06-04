# @fitness/config

共享开发配置包：TypeScript / ESLint / Prettier。

## 提供的配置文件

| 路径                         | 用途                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `tsconfig.base.json`         | 公共 strict 配置，extends 仓库根 `tsconfig.base.json`                                             |
| `tsconfig.node.json`         | NestJS / 脚本 / Prisma seed 用，`module: NodeNext`、`target: ES2022`，开 `experimentalDecorators` |
| `tsconfig.react-native.json` | React Native 0.76+ 用，`jsx: react-native`、`module: ESNext`、`moduleResolution: Bundler`         |
| `eslint.base.cjs`            | ESLint 9 flat config，含 `@eslint/js` + `typescript-eslint` + `eslint-config-prettier`            |
| `prettier.config.cjs`        | 行宽 100、单引号、`trailingComma: all`、LF                                                        |

## 业务包用法

`tsconfig.json` 示例（NestJS 后端）：

```json
{
  "extends": "@fitness/config/tsconfig.node.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

`eslint.config.cjs` 示例：

```js
const base = require('@fitness/config/eslint.base.cjs');
module.exports = [
  ...base,
  {
    files: ['src/**/*.{ts,tsx}'],
    // 业务包专属规则
  },
];
```

`prettier.config.cjs` 示例：

```js
module.exports = require('@fitness/config/prettier.config.cjs');
```

## 注意

- 本包只放静态配置，不放任何运行时代码，无 `src/`
- 依赖锁在本包内（`eslint` / `prettier` / `typescript` / `typescript-eslint`），业务包不需重复装
- 如果 flat config 与 RN/NestJS 插件冲突，按 `docs/HANDOFF.md §3.1.2` ⚠️ 提示降级到 legacy 并补 ADR
