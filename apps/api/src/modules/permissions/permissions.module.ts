import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { PermissionGuard } from '../../common/permissions/permission.guard';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  providers: [
    PermissionsService,
    PermissionGuard,
    {
      provide: APP_GUARD,
      useExisting: PermissionGuard,
    },
  ],
  exports: [PermissionsService],
})
export class PermissionsModule {}
