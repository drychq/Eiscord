import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditService } from '../../modules/audit/audit.service';
import { RealtimePublisher } from '../../modules/realtime/realtime.publisher';
import { EventCollector } from './event-collector';
import { PrismaService } from './prisma.service';

export type PrismaTx = Prisma.TransactionClient;

/**
 * Orchestrates database transactions together with realtime/audit side effects.
 * Side effects requested inside the callback are only flushed after the
 * transaction commits successfully; a rollback discards them.
 */
@Injectable()
export class PersistenceCoordinator {
  constructor(
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
    private readonly publisher: RealtimePublisher,
  ) {}

  async runWithEvents<T>(
    fn: (tx: PrismaTx, events: EventCollector) => Promise<T>,
  ): Promise<T> {
    const collector = new EventCollector(this.publisher, this.auditService);
    const result = await this.prisma.$transaction((tx) => fn(tx, collector));

    await collector.flush();

    return result;
  }
}
