/**
 * @fitness/db
 *
 * - prisma: 单例 PrismaClient
 * - 重新导出 Prisma 命名空间与所有 model 类型，便于业务包 `import type { User } from '@fitness/db'`
 * - SOFT_DELETE_MODELS: 软删除模型清单（M2 配合 extension 启用）
 *
 * 注：本包用 CommonJS 风格（无 type:module），与 Prisma 生成的 generated client
 * 一致，避免 NodeNext ESM 解析对相对 import 扩展名的强约束。
 */
export { prisma, SOFT_DELETE_MODELS, type SoftDeleteModel } from './client';
export * from './generated';
