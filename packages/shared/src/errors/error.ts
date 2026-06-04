import { z } from 'zod';
import { ERROR_CODE_VALUES, type ErrorCode } from './codes';

/**
 * 后端统一响应错误形（ARCH §8.2）：
 * ```json
 * { "code": "AUTH_INVALID_CREDENTIALS", "message": "手机号或密码错误", "details": {} }
 * ```
 */
export const ApiErrorSchema = z.object({
  code: z.enum(ERROR_CODE_VALUES),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/**
 * 业务异常基类形状（仅声明接口）。
 * TODO（M2）：在 apps/api 中实现 `class BizException extends Error implements BizExceptionLike`，
 *           供 controller 抛出、统一过滤器格式化。
 */
export interface BizExceptionLike {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  httpStatus?: number;
}
