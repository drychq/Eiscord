import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';

import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { getRequestId } from '../../common/request/request-id.util';
import type { AuthenticatedRequest } from '../../common/request/request.types';
import { LoadMessagesDto } from './dto/load-messages.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { MessagesService } from './messages.service';

@Controller()
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('channels/:channel_id/messages')
  loadChannelMessages(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('channel_id', ParseUUIDPipe) channelId: string,
    @Query() dto: LoadMessagesDto,
  ) {
    return this.messagesService.loadChannelMessages(user, channelId, dto);
  }

  @Post('channels/:channel_id/messages')
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
}
