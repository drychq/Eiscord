import type { ErrorCode } from '@eiscord/shared';

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;
  readonly httpStatus: number;
  readonly requestId: string;

  constructor(
    code: ErrorCode,
    message: string,
    httpStatus: number,
    requestId: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.requestId = requestId;
    this.details = details;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
