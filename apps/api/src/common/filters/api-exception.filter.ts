import type { ArgumentsHost } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ApiError } from '@fitness/shared';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import type { Response } from 'express';
import type { BizException as BizExc } from '../exceptions/biz-exception';

const isBizException = (exception: unknown): exception is BizExc & Error => {
  if (!exception || typeof exception !== 'object') return false;
  const e = exception as { name?: string; code?: string };
  return e.name === 'BizException' && typeof e.code === 'string';
};

@Catch()
export class ApiExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const resp = ctx.getResponse<Response>();

    if (isBizException(exception)) {
      const details = exception.details;
      const payload: ApiError = details
        ? { code: exception.code, message: exception.message, details }
        : { code: exception.code, message: exception.message };
      resp.status(exception.httpStatus).json(payload);
      return;
    }

    if (exception instanceof PrismaClientKnownRequestError) {
      if (exception.code === 'P2025') {
        resp.status(404).json({
          code: 'NOT_FOUND',
          message: '资源不存在',
          details: { prisma: exception.meta },
        } satisfies ApiError);
        return;
      }
      if (exception.code === 'P2002') {
        resp.status(409).json({
          code: 'AUTH_REGISTER_PHONE_TAKEN',
          message: '该手机号已被注册',
          details: { prismaTarget: exception.meta?.target ?? null },
        } satisfies ApiError);
        return;
      }
      this.logger.warn(`Unhandled prisma error ${exception.code}: ${exception.message}`);
      resp.status(500).json({
        code: 'INTERNAL_ERROR',
        message: '服务器内部错误，请稍后再试',
      } satisfies ApiError);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      let message =
        typeof res === 'string'
          ? res
          : typeof res === 'object' &&
              res !== null &&
              'message' in res &&
              typeof (res as { message: unknown }).message === 'string'
            ? (res as { message: string }).message
            : (HttpStatus[status] ?? 'Error');
      if (
        typeof res === 'object' &&
        res !== null &&
        'message' in res &&
        Array.isArray((res as { message: unknown }).message)
      ) {
        const msgs = (res as { message: string[] }).message;
        message = msgs.join('; ');
      }
      const payload: ApiError =
        status === 401 || status === 403
          ? {
              code: status === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
              message,
            }
          : { code: 'VALIDATION_FAILED', message };
      resp.status(status).json(payload);
      return;
    }

    const err = exception instanceof Error ? exception : undefined;
    this.logger.error(
      err?.stack ?? (typeof exception === 'string' ? exception : String(exception)),
    );
    resp.status(500).json({
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误，请稍后再试',
      details:
        process.env.NODE_ENV === 'production'
          ? undefined
          : { message: err?.message ?? String(exception) },
    } satisfies ApiError);
  }
}
