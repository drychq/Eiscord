import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ErrorCode } from '@eiscord/shared';

import { AppError } from '../errors/app-error';
import { AUTH_PUBLIC_METADATA, AUTH_REQUIRED_METADATA } from './auth.metadata';
import { TOKEN_VERIFIER } from './auth.types';
import type { TokenVerifier } from './auth.types';
import { extractBearerToken } from './token.utils';
import { AuthenticatedRequest } from '../request/request.types';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_VERIFIER) private readonly tokenVerifier: TokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    if (this.isPublicRoute(context)) {
      return true;
    }

    if (!this.isAuthRequired(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new AppError(ErrorCode.AuthRequired, 'Authentication is required.', HttpStatus.UNAUTHORIZED);
    }

    const user = await this.tokenVerifier.verifyAccessToken(token);

    if (!user || user.accountStatus === 'disabled') {
      throw new AppError(ErrorCode.AuthRequired, 'Access token is invalid.', HttpStatus.UNAUTHORIZED);
    }

    request.user = user;

    return true;
  }

  private isPublicRoute(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(AUTH_PUBLIC_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false
    );
  }

  private isAuthRequired(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(AUTH_REQUIRED_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? true
    );
  }
}
