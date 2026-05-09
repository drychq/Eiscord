import { Module } from '@nestjs/common';

import { PermissionGuard } from '../../common/permissions/permission.guard';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { AuditModule } from '../audit/audit.module';
import { PermissionsController } from './permissions.controller';

@Module({
  imports: [AuditModule],
  controllers: [PermissionsController],
  providers: [
    PermissionsService,
    PermissionGuard,
  ],
  exports: [PermissionGuard, PermissionsService],
})
export class PermissionsModule {}
