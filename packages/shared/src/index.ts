/**
 * @fitness/shared - 端到端共享层
 *
 * 所有跨 apps/api、apps/mobile、packages/ai-core 共用的：
 * - Zod schemas（schemas/）
 * - 枚举（enums/）
 * - 常量（constants/）
 * - 错误码与统一错误形（errors/）
 * - 中文文案（i18n/）
 *
 * 跨端类型从 schemas 用 `z.infer` 推导，禁止两边手写同名 interface（ARCH §8.1）。
 */

export * from './schemas';
export * from './enums';
export * from './constants';
export * from './errors';
export * from './utils/nutrition-tdee';
export * from './utils/strength-format';
export { errorMessagesZhCN, termsZhCN } from './i18n/zh-CN';
