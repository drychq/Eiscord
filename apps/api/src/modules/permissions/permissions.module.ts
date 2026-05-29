import { Module } from '@nestjs/common';

import { PermissionGuard } from '../../core/permissions/permission.guard';
import { PermissionsService } from '../../core/permissions/permissions.service';
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
