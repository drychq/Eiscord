import { Global, Module } from '@nestjs/common';

import { AuditModule } from '../../modules/audit/audit.module';
import { RealtimeModule } from '../../modules/realtime/realtime.module';
import { PersistenceCoordinator } from './persistence-coordinator.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  imports: [AuditModule, RealtimeModule],
  providers: [PersistenceCoordinator, PrismaService],
  exports: [PersistenceCoordinator, PrismaService],
})
export class PersistenceModule {}
