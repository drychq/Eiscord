import { Module, forwardRef } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MediaSignalingGateway } from './media-signaling.gateway';
import { MediaSignalingService } from './media-signaling.service';
import { MediasoupRouterRegistry } from './mediasoup-router.registry';
import { MediasoupWorkerClient } from './mediasoup-worker.client';
import { TurnCredentialService } from './turn-credential.service';

@Module({
  imports: [AuditModule, PermissionsModule, forwardRef(() => RealtimeModule)],
  providers: [
    MediaSignalingGateway,
    MediaSignalingService,
    MediasoupRouterRegistry,
    MediasoupWorkerClient,
    TurnCredentialService,
  ],
  exports: [MediaSignalingService, MediasoupWorkerClient, TurnCredentialService],
})
export class MediaSignalingModule {}
