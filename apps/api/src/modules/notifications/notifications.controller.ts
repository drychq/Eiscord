import { Body, Controller, Get, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { MarkNotificationsReadDto } from './dto/mark-notifications-read.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  listNotifications(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query() dto: ListNotificationsDto,
  ) {
    return this.notificationsService.listNotifications(user, dto);
  }

  @Post('read')
  markRead(
    @CurrentUser() user: AuthenticatedUserContext,
    @Body() dto: MarkNotificationsReadDto,
  ) {
    return this.notificationsService.markRead(user, dto);
  }
}
