import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';

import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { getRequestId } from '../../common/request/request-id.util';
import type { AuthenticatedRequest } from '../../common/request/request.types';
import { AttachmentsService } from './attachments.service';
import { InitAttachmentDto } from './dto/init-attachment.dto';

@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('init')
  initAttachment(
    @CurrentUser() user: AuthenticatedUserContext,
    @Body() dto: InitAttachmentDto,
  ) {
    return this.attachmentsService.initAttachment(user, dto);
  }

  @Post(':attachment_id/complete')
  completeAttachment(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('attachment_id', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.attachmentsService.completeAttachment(user, attachmentId);
  }

  @Get(':attachment_id')
  getAttachmentAccess(
    @CurrentUser() user: AuthenticatedUserContext,
    @Param('attachment_id', ParseUUIDPipe) attachmentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.attachmentsService.getAttachmentAccess(user, attachmentId, getRequestId(request));
  }
}
