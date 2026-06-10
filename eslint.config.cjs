/**
 * 仓库根 ESLint flat config（lint-staged 从根目录对暂存文件跑 eslint 时使用）。
 * 继承 @fitness/config 与业务子包内 eslint.config.cjs 规则一致。
 */
const base = require('./packages/config/eslint.base.cjs');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  ...base,
  /**
   * apps/api：Nest emitDecoratorMetadata 需要构造函数注入类为值导入。
   * lint-staged 从仓库根跑 eslint，须在此覆盖 base 的 consistent-type-imports。
   */
  {
    files: ['apps/api/src/**/*.ts', 'apps/api/test/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
