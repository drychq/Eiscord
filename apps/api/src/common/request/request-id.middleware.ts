import { randomUUID } from 'node:crypto';

import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

type RequestWithId = Request & {
  requestId?: string;
};

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithId, response: Response, next: NextFunction) {
    const headerValue = request.header('x-request-id');
    const requestId = headerValue && headerValue.length > 0 ? headerValue : randomUUID();

    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
  }
}
