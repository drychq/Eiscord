import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { VoiceModule } from '../voice/voice.module';
import { PresenceService } from './presence.service';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimePublisher } from './realtime.publisher';

@Module({
  imports: [AuthModule, AuditModule, PermissionsModule, forwardRef(() => VoiceModule)],
  providers: [PresenceService, RealtimeGateway, RealtimePublisher],
  exports: [PresenceService, RealtimePublisher],
})
export class RealtimeModule {}
