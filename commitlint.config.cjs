/**
 * Commitlint：Conventional Commits（与 ARCH §8.4 一致）
 * @see https://www.conventionalcommits.org/
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  // 如需放宽 subject 长度、禁止 body 空行等，在此加 rules
};
