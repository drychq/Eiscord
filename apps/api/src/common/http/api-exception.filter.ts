import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

import { ErrorCode } from '@eiscord/shared';

import { AppError } from '../errors/app-error';
import { createApiErrorResponse } from './api-response.factory';
import { getRequestId } from '../request/request-id.util';
import { RequestWithId } from '../request/request.types';
import { isRecord } from '../utils/is-record';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') {
      throw exception;
    }

    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const normalized = normalizeException(exception);

    if (!(exception instanceof AppError) && !(exception instanceof HttpException)) {
      this.logger.error(formatUnknownException(exception));
    }

    const body = createApiErrorResponse({
      code: normalized.code,
      message: normalized.message,
      requestId: getRequestId(request),
      details: normalized.details,
    });

    response.status(normalized.httpStatus).json(body);
  }
}

function formatUnknownException(exception: unknown): string {
  if (exception instanceof Error) {
    return exception.stack ?? exception.message;
  }

  return String(exception);
}

type NormalizedException = {
  code: ErrorCode;
  details?: Record<string, unknown>;
  httpStatus: number;
  message: string;
};

function normalizeException(exception: unknown): NormalizedException {
  if (exception instanceof AppError) {
    return {
      code: exception.code,
      details: exception.details,
      httpStatus: exception.httpStatus,
      message: exception.message,
    };
  }

  if (exception instanceof HttpException) {
    return normalizeHttpException(exception);
  }

  return {
    code: ErrorCode.InternalError,
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    message: 'Internal server error',
  };
}

function normalizeHttpException(exception: HttpException): NormalizedException {
  const status = exception.getStatus();
  const payload = exception.getResponse();
  const message = extractHttpMessage(payload, exception.message);

  return {
    code: mapHttpStatusToErrorCode(status),
    details: extractHttpDetails(payload),
    httpStatus: status,
    message,
  };
}

function extractHttpMessage(payload: string | object, fallback: string): string {
  if (typeof payload === 'string') {
    return payload;
  }

  if (!isRecord(payload)) {
    return fallback;
  }

  const message = payload.message;

  if (Array.isArray(message)) {
    return 'Request validation failed';
  }

  if (typeof message === 'string' && message.length > 0) {
    return message;
  }

  return fallback;
}

function extractHttpDetails(payload: string | object): Record<string, unknown> | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const message = payload.message;

  if (Array.isArray(message)) {
    return { validation_errors: message.filter((item) => typeof item === 'string') };
  }

  return undefined;
}

function mapHttpStatusToErrorCode(status: number): ErrorCode {
  if (status === HttpStatus.BAD_REQUEST) {
    return ErrorCode.ValidationFailed;
  }

  if (status === HttpStatus.UNAUTHORIZED) {
    return ErrorCode.AuthRequired;
  }

  if (status === HttpStatus.FORBIDDEN) {
    return ErrorCode.PermissionDenied;
  }

  if (status === HttpStatus.NOT_FOUND) {
    return ErrorCode.ResourceNotFound;
  }

  if (status === HttpStatus.CONFLICT) {
    return ErrorCode.Conflict;
  }

  if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
    return ErrorCode.PayloadTooLarge;
  }

  if (status === HttpStatus.TOO_MANY_REQUESTS) {
    return ErrorCode.RateLimited;
  }

  if (status === HttpStatus.SERVICE_UNAVAILABLE) {
    return ErrorCode.DependencyUnavailable;
  }

  return ErrorCode.InternalError;
}
