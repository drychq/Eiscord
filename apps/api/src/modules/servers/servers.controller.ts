import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';

import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { AuthenticatedUserContext } from '../../core/auth/auth.types';
import { PermissionAction } from '../../core/permissions/permission.types';
import { RequirePermissionForParam } from '../../core/permissions/require-permission.decorator';
import { getRequestId } from '../../core/request/request-id.util';
import type { AuthenticatedRequest } from '../../core/request/request.types';
import { AssignMemberRoleDto } from './dto/assign-member-role.dto';
import { CreateServerDto } from './dto/create-server.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { JoinServerDto } from './dto/join-server.dto';
import { ManageMemberDto } from './dto/manage-member.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ServersService } from './servers.service';

@Controller('servers')
export class ServersController {
  constructor(private readonly serversService: ServersService) {}

  @Post()
  createServer(
    @CurrentUser() user: AuthenticatedUserContext,
    @Body() dto: CreateServerDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.serversService.createServer(user, dto, getRequestId(request));
  }

  @Get()
  listServers(@CurrentUser() user: AuthenticatedUserContext) {
    return this.serversService.listServers(user);
  }

  @Get(':server_id')
  getServer(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('server_id', ParseUUIDPipe) serverId: string,
  ) {
    return this.serversService.getServerDetail(user, serverId);
  }

  @Post('join')
  joinServer(
    @CurrentUser() user: AuthenticatedUserContext,
    @Body() dto: JoinServerDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.serversService.joinServer(user, dto, getRequestId(request));
  }

  @Post(':server_id/leave')
  leaveServer(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('server_id', ParseUUIDPipe) serverId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.serversService.leaveServer(user, serverId, getRequestId(request));
  }

  @Get(':server_id/members')
  listMembers(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('server_id', ParseUUIDPipe) serverId: string,
  ) {
    return this.serversService.listMembers(user, serverId);
  }

  @Patch(':server_id/members/:member_id')
  @RequirePermissionForParam(PermissionAction.ManageMember, 'server', 'server_id')
  manageMember(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('server_id', ParseUUIDPipe) serverId: string,
    @Param('member_id', ParseUUIDPipe) memberId: string,
    @Body() dto: ManageMemberDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.serversService.manageMember(user, serverId, memberId, dto, getRequestId(request));
  }

  @Get(':server_id/roles')
  listRoles(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('server_id', ParseUUIDPipe) serverId: string,
  ) {
    return this.serversService.listRolesForUser(user, serverId);
  }

  @Post(':server_id/roles')
  @RequirePermissionForParam(PermissionAction.ManageRole, 'server', 'server_id')
  createRole(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('server_id', ParseUUIDPipe) serverId: string,
    @Body() dto: CreateRoleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.serversService.createRole(user, serverId, dto, getRequestId(request));
  }

  @Patch(':server_id/roles/:role_id')
  @RequirePermissionForParam(PermissionAction.ManageRole, 'server', 'server_id')
  updateRole(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('role_id', ParseUUIDPipe) roleId: string,
    @Body() dto: UpdateRoleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.serversService.updateRole(user, roleId, dto, getRequestId(request));
  }

  @Delete(':server_id/roles/:role_id')
  @RequirePermissionForParam(PermissionAction.ManageRole, 'server', 'server_id')
  deleteRole(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('role_id', ParseUUIDPipe) roleId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.serversService.deleteRole(user, roleId, getRequestId(request));
  }

  @Post(':server_id/members/:member_id/roles')
  @RequirePermissionForParam(PermissionAction.ManageRole, 'server', 'server_id')
  assignRole(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('server_id', ParseUUIDPipe) serverId: string,
    @Param('member_id', ParseUUIDPipe) memberId: string,
    @Body() dto: AssignMemberRoleDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.serversService.assignRoleToMember(
      user,
      serverId,
      memberId,
      dto,
      getRequestId(request),
    );
  }

  @Delete(':server_id/members/:member_id/roles/:role_id')
  @RequirePermissionForParam(PermissionAction.ManageRole, 'server', 'server_id')
  removeRole(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('server_id', ParseUUIDPipe) serverId: string,
    @Param('member_id', ParseUUIDPipe) memberId: string,
    @Param('role_id', ParseUUIDPipe) roleId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.serversService.removeRoleFromMember(
      user,
      serverId,
      memberId,
      roleId,
      getRequestId(request),
    );
  }
}
