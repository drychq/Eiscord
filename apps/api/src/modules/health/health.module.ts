import { Module } from '@nestjs/common';

import { MediaSignalingModule } from '../media-signaling/media-signaling.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [MediaSignalingModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
