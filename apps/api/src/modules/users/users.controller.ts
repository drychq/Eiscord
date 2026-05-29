import { Body, Controller, Get, Patch, Query, Req } from '@nestjs/common';

import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { AuthenticatedUserContext } from '../../core/auth/auth.types';
import { RateLimit } from '../../core/rate-limit/rate-limit.decorator';
import { getRequestId } from '../../core/request/request-id.util';
import type { AuthenticatedRequest } from '../../core/request/request.types';
import { SearchUsersDto } from './dto/search-users.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePresenceDto } from './dto/update-presence.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUserContext) {
    return this.usersService.getCurrentUser(user);
  }

  @RateLimit({ limit: 60, windowMs: 60 * 1000 })
  @Get('search')
  searchUsers(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() dto: SearchUsersDto,
  ) {
    return this.usersService.searchUsers(user, dto);
  }

  @Patch('me/profile')
  updateProfile(
    @CurrentUser() user: AuthenticatedUserContext,
    @Body() dto: UpdateProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.usersService.updateProfile(user, dto, getRequestId(request));
  }

  @Patch('me/presence')
  updatePresence(
    @CurrentUser() user: AuthenticatedUserContext,
    @Body() dto: UpdatePresenceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.usersService.updatePresence(user, dto, getRequestId(request));
  }
}
