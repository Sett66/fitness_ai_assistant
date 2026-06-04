import { PaginationQuerySchema } from '@fitness/shared';

import { BizException } from '../src/common/exceptions/biz-exception';
import { parseWith } from '../src/common/zod/parse-with';

describe('parseWith', () => {
  it('将 querystring 分页参数 coercion 成功', () => {
    expect(parseWith(PaginationQuerySchema, { limit: '12' }).limit).toBe(12);
  });

  it('校验失败抛出 BizException', () => {
    expect(() => parseWith(PaginationQuerySchema, { limit: '1000' })).toThrow(BizException);
  });
});
