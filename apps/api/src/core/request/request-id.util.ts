import { randomUUID } from 'node:crypto';

import { RequestWithId } from './request.types';

export function getRequestId(request: RequestWithId): string {
  const headerValue = request.header('x-request-id');

  if (request.requestId && request.requestId.length > 0) {
    return request.requestId;
  }

  if (headerValue && headerValue.length > 0) {
    return headerValue;
  }

  return randomUUID();
}
