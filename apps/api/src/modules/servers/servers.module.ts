import { forwardRef, Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { VoiceModule } from '../voice/voice.module';
import { RolesController } from './roles.controller';
import { ServersController } from './servers.controller';
import { ServersRepository } from './servers.repository';
import { ServersService } from './servers.service';

@Module({
  imports: [AuditModule, NotificationsModule, PermissionsModule, RealtimeModule, forwardRef(() => VoiceModule)],
  controllers: [RolesController, ServersController],
  providers: [ServersRepository, ServersService],
  exports: [ServersService],
})
export class ServersModule {}
