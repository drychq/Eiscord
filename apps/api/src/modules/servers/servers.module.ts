import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RolesController } from './roles.controller';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

@Module({
  imports: [AuditModule, PermissionsModule, RealtimeModule],
  controllers: [RolesController, ServersController],
  providers: [ServersService],
  exports: [ServersService],
})
export class ServersModule {}
