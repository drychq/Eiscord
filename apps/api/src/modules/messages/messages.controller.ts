import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';

import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { AuthenticatedUserContext } from '../../core/auth/auth.types';
import { PermissionAction } from '../../core/permissions/permission.types';
import { RequirePermissionForParam } from '../../core/permissions/require-permission.decorator';
import { getRequestId } from '../../core/request/request-id.util';
import type { AuthenticatedRequest } from '../../core/request/request.types';
import { DeleteMessageDto } from './dto/delete-message.dto';
import { LoadMessagesDto } from './dto/load-messages.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { MessagesService } from './messages.service';

@Controller()
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('channels/:channel_id/messages')
  @RequirePermissionForParam(PermissionAction.ViewChannel, 'channel', 'channel_id')
  loadChannelMessages(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('channel_id', ParseUUIDPipe) channelId: string,
    @Query() dto: LoadMessagesDto,
  ) {
    return this.messagesService.loadChannelMessages(user, channelId, dto);
  }

  @Post('channels/:channel_id/messages')
  @RequirePermissionForParam(PermissionAction.SendMessage, 'channel', 'channel_id')
  sendChannelMessage(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('channel_id', ParseUUIDPipe) channelId: string,
    @Body() dto: SendMessageDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.messagesService.sendChannelMessage(user, channelId, dto, getRequestId(request));
  }

  @Get('dm-conversations/:conversation_id/messages')
  loadDirectMessages(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('conversation_id', ParseUUIDPipe) conversationId: string,
    @Query() dto: LoadMessagesDto,
  ) {
    return this.messagesService.loadDirectMessages(user, conversationId, dto);
  }

  @Post('dm-conversations/:conversation_id/messages')
  sendDirectMessage(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('conversation_id', ParseUUIDPipe) conversationId: string,
    @Body() dto: SendMessageDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.messagesService.sendDirectMessage(user, conversationId, dto, getRequestId(request));
  }

  @Post('read-states')
  markRead(
    @CurrentUser() user: AuthenticatedUserContext,
    @Body() dto: MarkReadDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.messagesService.markRead(user, dto, getRequestId(request));
  }

  @Post('messages/:message_id/delete')
  deleteMessage(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('message_id', ParseUUIDPipe) messageId: string,
    @Body() dto: DeleteMessageDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.messagesService.deleteMessage(user, messageId, dto, getRequestId(request));
  }
}
