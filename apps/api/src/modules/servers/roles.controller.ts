import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Req } from '@nestjs/common';

import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { getRequestId } from '../../common/request/request-id.util';
import type { AuthenticatedRequest } from '../../common/request/request.types';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ServersService } from './servers.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly serversService: ServersService) {}

  @Patch(':role_id')
  updateRole(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('role_id', ParseUUIDPipe) roleId: string,
    @Body() dto: UpdateRoleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.serversService.updateRole(user, roleId, dto, getRequestId(request));
  }

  @Delete(':role_id')
  deleteRole(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('role_id', ParseUUIDPipe) roleId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.serversService.deleteRole(user, roleId, getRequestId(request));
  }
}
