import { Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';

import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { AuthenticatedUserContext } from '../../core/auth/auth.types';
import { PermissionAction } from '../../core/permissions/permission.types';
import { RequirePermissionForParam } from '../../core/permissions/require-permission.decorator';
import { getRequestId } from '../../core/request/request-id.util';
import type { AuthenticatedRequest } from '../../core/request/request.types';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

@Controller()
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Post('servers/:server_id/channels')
  @RequirePermissionForParam(PermissionAction.ManageChannel, 'server', 'server_id')
  createChannel(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('server_id', ParseUUIDPipe) serverId: string,
    @Body() dto: CreateChannelDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.channelsService.createChannel(user, serverId, dto, getRequestId(request));
  }

  @Patch('channels/:channel_id')
  @RequirePermissionForParam(PermissionAction.ManageChannel, 'channel', 'channel_id')
  updateChannel(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('channel_id', ParseUUIDPipe) channelId: string,
    @Body() dto: UpdateChannelDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.channelsService.updateChannel(user, channelId, dto, getRequestId(request));
  }

  @Delete('channels/:channel_id')
  @RequirePermissionForParam(PermissionAction.ManageChannel, 'channel', 'channel_id')
  deleteChannel(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('channel_id', ParseUUIDPipe) channelId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.channelsService.deleteChannel(user, channelId, getRequestId(request));
  }
}
