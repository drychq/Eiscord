import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';

import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { getRequestId } from '../../common/request/request-id.util';
import type { AuthenticatedRequest } from '../../common/request/request.types';
import { CreateServerDto } from './dto/create-server.dto';
import { JoinServerDto } from './dto/join-server.dto';
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
}
