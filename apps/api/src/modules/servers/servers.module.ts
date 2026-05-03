import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

@Module({
  imports: [AuditModule, RealtimeModule],
  controllers: [ServersController],
  providers: [ServersService],
  exports: [ServersService],
})
export class ServersModule {}
