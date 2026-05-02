import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ErrorCode } from '@eiscord/shared';

import { AppError } from '../errors/app-error';
import { AuthenticatedRequest } from '../request/request.types';
import { RATE_LIMIT_METADATA, RateLimitOptions } from './rate-limit.decorator';

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const bucketKey = this.createBucketKey(request, context);
    const now = Date.now();
    const current = this.buckets.get(bucketKey);

    if (!current || current.resetAt <= now) {
      this.buckets.set(bucketKey, { count: 1, resetAt: now + options.windowMs });
      return true;
    }

    if (current.count >= options.limit) {
      throw new AppError(
        ErrorCode.RateLimited,
        'Too many requests. Please retry later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    current.count += 1;
    return true;
  }

  private createBucketKey(request: AuthenticatedRequest, context: ExecutionContext): string {
    const actor = request.user?.userId ?? request.ip ?? 'anonymous';
    const handlerName = context.getHandler().name;
    const className = context.getClass().name;

    return `${actor}:${className}.${handlerName}`;
  }
}
