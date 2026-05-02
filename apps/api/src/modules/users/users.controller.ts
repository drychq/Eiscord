import { Body, Controller, Get, Patch, Req } from '@nestjs/common';

import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { getRequestId } from '../../common/request/request-id.util';
import type { AuthenticatedRequest } from '../../common/request/request.types';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUserContext) {
    return this.usersService.getCurrentUser(user);
  }

  @Patch('me/profile')
  updateProfile(
    @CurrentUser() user: AuthenticatedUserContext,
    @Body() dto: UpdateProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.usersService.updateProfile(user, dto, getRequestId(request));
  }
}
