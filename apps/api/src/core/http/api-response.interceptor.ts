import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

import { createApiSuccessResponse, isApiResponseEnvelope } from './api-response.factory';
import { getRequestId } from '../request/request-id.util';
import { RequestWithId } from '../request/request.types';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestWithId>();

    return next.handle().pipe(
      map((data: unknown) => {
        if (isApiResponseEnvelope(data)) {
          return data;
        }

        return createApiSuccessResponse(data ?? null, getRequestId(request));
      }),
    );
  }
}
