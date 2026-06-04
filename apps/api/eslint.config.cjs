const base = require('@fitness/config/eslint.base.cjs');

/** @type {import('eslint').Linter.Config[]} */
module.exports = [
  ...base,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        projectService: false,
      },
    },
  },
  /**
   * Nest `emitDecoratorMetadata` 依赖运行时构造函数引用；`import type` / consistent-type-imports
   * 会破坏 Controller / Guard / Strategy / Service 的 DI。
   */
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
