import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';

import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { PermissionAction } from '../../common/permissions/permission.types';
import { RequirePermissionForParam } from '../../common/permissions/require-permission.decorator';
import { getRequestId } from '../../common/request/request-id.util';
import type { AuthenticatedRequest } from '../../common/request/request.types';
import { JoinVoiceChannelDto } from './dto/join-voice-channel.dto';
import { UpdateVoiceStateDto } from './dto/update-voice-state.dto';
import { VoiceService } from './voice.service';

@Controller('voice')
export class VoiceController {
  constructor(private readonly voiceService: VoiceService) {}

  @Post('channels/:channel_id/join')
  @RequirePermissionForParam(PermissionAction.JoinVoice, 'voice', 'channel_id')
  joinChannel(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('channel_id', ParseUUIDPipe) channelId: string,
    @Body() dto: JoinVoiceChannelDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.voiceService.joinChannel(user, channelId, dto, getRequestId(request));
  }

  @Get('channels/:channel_id/sessions')
  listChannelSessions(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('channel_id', ParseUUIDPipe) channelId: string,
  ) {
    return this.voiceService.listChannelSessions(user, channelId);
  }

  @Post('sessions/:session_id/leave')
  leaveSession(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('session_id', ParseUUIDPipe) sessionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.voiceService.leaveSession(user, sessionId, getRequestId(request));
  }

  @Get('sessions/:session_id/ice-servers')
  refreshIceServers(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('session_id', ParseUUIDPipe) sessionId: string,
  ) {
    return this.voiceService.refreshIceServers(user, sessionId);
  }

  @Patch('sessions/:session_id/state')
  updateState(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('session_id', ParseUUIDPipe) sessionId: string,
    @Body() dto: UpdateVoiceStateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.voiceService.updateState(user, sessionId, dto, getRequestId(request));
  }
}
