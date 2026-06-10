# @fitness/ui

RN 通用组件库（react-native-reusables 落地 + NativeWind 主题）。

> **状态：M1 占位**
>
> 真实实现见 **M4**。

## 计划目录结构（M4 落地）

详见 `docs/ARCHITECTURE.md` §3.

```
src/
├── primitives/              # Button / Text / Input / Sheet / Dialog / ...
├── components/              # 组合型组件（StatCard / ProgressRing / ...）
├── hooks/                   # useTheme / useColorScheme
├── icons/                   # lucide-react-native 集中导出
├── theme.ts                 # NativeWind theme tokens
└── index.ts
```

## 注意

- `tsconfig.json` 暂时 `"types": []` 占位，**M4 装 RN 依赖后**改回 `["react-native"]`
- 严禁混入 expo 包

## TODO（M4）

- [ ] 引入 `nativewind` / `tailwindcss` / `react-native-reusables` / `lucide-react-native`
- [ ] 把 reusables 的 primitives 落地到 `src/primitives/`
- [ ] 组合型组件（StatCard / ProgressRing / Calendar / ...）
