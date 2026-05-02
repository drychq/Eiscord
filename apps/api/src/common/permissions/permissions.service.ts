import { HttpStatus, Injectable } from '@nestjs/common';

import { ErrorCode } from '@eiscord/shared';

import { AppError } from '../errors/app-error';
import { PermissionCheckInput } from './permission.types';

@Injectable()
export class PermissionsService {
  assertAllowed(input: PermissionCheckInput): Promise<void> {
    void input;

    throw new AppError(
      ErrorCode.PermissionDenied,
      'Permission calculation is not implemented yet.',
      HttpStatus.FORBIDDEN,
    );
  }
}
