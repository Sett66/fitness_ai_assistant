export type AiCoreErrorCode =
  | 'AI_CORE_MISSING_API_KEY'
  | 'AI_TASK_PARSE_FAILED'
  | 'AI_CORE_PROVIDER_ERROR'
  | 'AI_CORE_UNSUPPORTED_TASK';

export class AiCoreError extends Error {
  readonly code: AiCoreErrorCode;
  override readonly cause?: unknown;

  constructor(code: AiCoreErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'AiCoreError';
    this.code = code;
    this.cause = cause;
  }
}
