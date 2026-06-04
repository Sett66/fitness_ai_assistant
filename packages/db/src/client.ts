import { PrismaClient } from './generated';

/**
 * 单例 PrismaClient。
 *
 * 在 dev 模式下走 globalThis 缓存，避免 Hot Reload / ts-node-dev 重启
 * 时反复 new 实例耗尽数据库连接池。
 *
 * 软删除拦截 TODO（M2 各业务 service 落地时实装）：
 * - 用 `$extends({ query: ... })` 对 SOFT_DELETE_MODELS 中的模型重写
 *   findMany / findFirst / delete / deleteMany，自动追加 `where: { deletedAt: null }`。
 * - findUnique / findUniqueOrThrow 用唯一键查询，不适合无脑 patch；
 *   业务层调用时显式选择 `prisma.user.findFirst({ where: { id, deletedAt: null } })`。
 *
 * @see docs/ARCHITECTURE.md §4 数据建模通则
 */
type GlobalWithPrisma = typeof globalThis & {
  __fitnessPrisma?: PrismaClient;
};

const globalForPrisma = globalThis as GlobalWithPrisma;

const createPrismaClient = (): PrismaClient =>
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

export const prisma: PrismaClient = globalForPrisma.__fitnessPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__fitnessPrisma = prisma;
}

/** 业务级软删除模型清单，供未来 extension 使用 */
export const SOFT_DELETE_MODELS = [
  'User',
  'Exercise',
  'Food',
  'Plan',
  'WorkoutSession',
  'MealLog',
  'Post',
] as const;
export type SoftDeleteModel = (typeof SOFT_DELETE_MODELS)[number];
