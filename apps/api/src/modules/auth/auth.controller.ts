import { Body, Controller, Post, Req } from '@nestjs/common';

import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import type { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { getRequestId } from '../../common/request/request-id.util';
import type { AuthenticatedRequest, RequestWithId } from '../../common/request/request.types';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { RefreshSessionDto } from './dto/refresh-session.dto';
import { RegisterUserDto } from './dto/register-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterUserDto, @Req() request: RequestWithId) {
    return this.authService.register(dto, getRequestId(request));
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginUserDto, @Req() request: RequestWithId) {
    return this.authService.login(dto, getRequestId(request));
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshSessionDto, @Req() request: RequestWithId) {
    return this.authService.refresh(dto, getRequestId(request));
  }

  @Post('logout')
  logout(
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.authService.logout(user, getRequestId(request));
  }
}
