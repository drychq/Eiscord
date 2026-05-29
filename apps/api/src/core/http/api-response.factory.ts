import { randomUUID } from 'node:crypto';

import { ApiErrorResponse, ApiSuccessResponse, ErrorCode } from '@eiscord/shared';

export function createApiSuccessResponse<TData>(
  data: TData,
  requestId: string,
): ApiSuccessResponse<TData> {
  return {
    data,
    request_id: requestId,
    server_time: new Date().toISOString(),
  };
}

export function createApiErrorResponse(input: {
  code: ErrorCode;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
}): ApiErrorResponse {
  return {
    error: {
      code: input.code,
      message: input.message,
      ...(input.details ? { details: input.details } : {}),
    },
    request_id: input.requestId ?? randomUUID(),
    server_time: new Date().toISOString(),
  };
}

export function isApiResponseEnvelope(value: unknown): value is ApiSuccessResponse<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('data' in value || 'error' in value) &&
    'request_id' in value &&
    'server_time' in value
  );
}
