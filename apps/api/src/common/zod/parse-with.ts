import type { z } from 'zod';

import { BizException } from '../exceptions/biz-exception';

export function parseWith<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw BizException.validation({ issues: r.error.flatten() });
  }
  return r.data;
}
