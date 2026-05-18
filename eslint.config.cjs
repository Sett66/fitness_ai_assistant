/**
 * 仓库根 ESLint flat config（lint-staged 从根目录对暂存文件跑 eslint 时使用）。
 * 继承 @fitness/config 与业务子包内 eslint.config.cjs 规则一致。
 */
module.exports = require('./packages/config/eslint.base.cjs');
