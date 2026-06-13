module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    // pnpm 将依赖存放在 node_modules/.pnpm/xxx/node_modules/ 嵌套路径下，
    // 需要用 .* 通配中间层级，否则 babel 不会转换这些 ESM 包。
    'node_modules/(?!.*(react-native|@react-native|@react-native-community)/)',
  ],
};
