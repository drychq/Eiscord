import { forwardRef, Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { MediaSignalingModule } from '../media-signaling/media-signaling.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';

@Module({
  imports: [AuditModule, MediaSignalingModule, PermissionsModule, forwardRef(() => RealtimeModule)],
  controllers: [VoiceController],
  providers: [VoiceService],
  exports: [VoiceService],
})
export class VoiceModule {}
