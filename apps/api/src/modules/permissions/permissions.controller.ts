import { Body, Controller, Post } from '@nestjs/common';

import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { AuthenticatedUserContext } from '../../core/auth/auth.types';
import { PermissionsService } from '../../core/permissions/permissions.service';
import { CheckPermissionDto } from './dto/check-permission.dto';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post('check')
  async checkPermission(
    @CurrentUser() user: AuthenticatedUserContext,
    @Body() dto: CheckPermissionDto,
  ): Promise<{ allowed: boolean }> {
    const decision = await this.permissionsService.checkAllowed({
      action: dto.action,
      resource: {
        id: dto.resource_id,
        type: dto.resource_type,
      },
      user,
    });

    return { allowed: decision.allowed };
  }
}
