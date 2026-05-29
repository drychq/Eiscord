import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ErrorCode } from '@eiscord/shared';

import { AppError } from '../errors/app-error';
import {
  PermissionRequirement,
  REQUIRE_PERMISSION_METADATA,
} from './require-permission.decorator';
import { PermissionsService } from './permissions.service';
import { AuthenticatedRequest } from '../request/request.types';
import { getRequestId } from '../request/request-id.util';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }

    const requirement = this.reflector.getAllAndOverride<PermissionRequirement>(
      REQUIRE_PERMISSION_METADATA,
      [context.getHandler(), context.getClass()],
    );

    if (!requirement) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.user) {
      throw new AppError(ErrorCode.AuthRequired, 'Authentication is required.', HttpStatus.UNAUTHORIZED);
    }

    const resourceId = request.params[requirement.resourceIdParam];

    if (!resourceId) {
      throw new AppError(
        ErrorCode.ValidationFailed,
        'Permission resource identifier is missing.',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.permissionsService.assertAllowed({
      action: requirement.action,
      requestId: getRequestId(request),
      resource: {
        id: resourceId,
        type: requirement.resourceType,
      },
      user: request.user,
    });

    return true;
  }
}
