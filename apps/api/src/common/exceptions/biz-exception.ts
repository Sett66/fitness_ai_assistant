import type { ErrorCode } from '@fitness/shared';

export type BizDetails = Record<string, unknown>;

/**
 * ARCH §8.2：可由全局过滤器转成统一 JSON，
 * `{ code, message, details }`。
 */
export class BizException extends Error {
  override readonly name = 'BizException';

  readonly code: ErrorCode;

  readonly httpStatus: number;

  readonly details?: BizDetails;

  constructor(code: ErrorCode, message: string, httpStatus = 400, details?: BizDetails) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }

  /**
   * 按错误码拼装中文短语；若已知 message 更清晰可继续传第二层。
   */
  static validation(details?: BizDetails): BizException {
    return new BizException('VALIDATION_FAILED', '提交内容不符合要求', 400, details);
  }
}
