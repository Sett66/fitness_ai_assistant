import { Prisma } from '@fitness/db';

/** Prisma P2002：唯一约束冲突。duck-type 兼容 generated client 与根目录 @prisma/client 不是同一类引用。 */
export function isUniqueViolation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return true;
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: string };
  return e.name === 'PrismaClientKnownRequestError' && e.code === 'P2002';
}
