import { HttpStatus } from '@nestjs/common';

import { ErrorCode } from '@eiscord/shared';

export class AppError extends Error {
  readonly code: ErrorCode;

  readonly details?: Record<string, unknown>;

  readonly httpStatus: number;

  constructor(
    code: ErrorCode,
    message: string,
    httpStatus = HttpStatus.BAD_REQUEST,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = AppError.name;
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}
