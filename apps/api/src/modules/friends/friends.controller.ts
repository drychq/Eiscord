import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';

import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { AuthenticatedUserContext } from '../../core/auth/auth.types';
import { getRequestId } from '../../core/request/request-id.util';
import type { AuthenticatedRequest } from '../../core/request/request.types';
import { CreateFriendRequestDto } from './dto/create-friend-request.dto';
import { FriendsService } from './friends.service';

@Controller()
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Get('friends')
  listFriends(@CurrentUser() user: AuthenticatedUserContext) {
    return this.friendsService.listFriends(user);
  }

  @Post('friend-requests')
  createFriendRequest(
    @CurrentUser() user: AuthenticatedUserContext,
    @Body() dto: CreateFriendRequestDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.friendsService.createFriendRequest(user, dto, getRequestId(request));
  }

  @Post('friend-requests/:friendship_id/accept')
  acceptFriendRequest(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('friendship_id', ParseUUIDPipe) friendshipId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.friendsService.acceptFriendRequest(user, friendshipId, getRequestId(request));
  }

  @Post('friend-requests/:friendship_id/reject')
  rejectFriendRequest(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('friendship_id', ParseUUIDPipe) friendshipId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.friendsService.rejectFriendRequest(user, friendshipId, getRequestId(request));
  }

  @Get('dm-conversations')
  listDirectConversations(@CurrentUser() user: AuthenticatedUserContext) {
    return this.friendsService.listDirectConversations(user);
  }
}
