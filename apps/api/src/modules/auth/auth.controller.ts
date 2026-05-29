import { Body, Controller, Post, Req } from '@nestjs/common';

import { CurrentUser } from '../../core/auth/current-user.decorator';
import { Public } from '../../core/auth/public.decorator';
import type { AuthenticatedUserContext } from '../../core/auth/auth.types';
import { RateLimit } from '../../core/rate-limit/rate-limit.decorator';
import { getRequestId } from '../../core/request/request-id.util';
import type { AuthenticatedRequest, RequestWithId } from '../../core/request/request.types';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { RefreshSessionDto } from './dto/refresh-session.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordResetService } from './password-reset.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

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

  @Public()
  @RateLimit({ limit: 10, windowMs: 60 * 60 * 1000 })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() request: RequestWithId) {
    return this.passwordResetService.forgotPassword(dto, getRequestId(request));
  }

  @Public()
  @RateLimit({ limit: 20, windowMs: 60 * 60 * 1000 })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto, @Req() request: RequestWithId) {
    return this.passwordResetService.resetPassword(dto, getRequestId(request));
  }

  @Post('logout')
  logout(
    @CurrentUser() user: AuthenticatedUserContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.authService.logout(user, getRequestId(request));
  }
}
