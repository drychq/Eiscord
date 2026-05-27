import type { RealtimeEvent } from '@eiscord/shared';

import type { AuditRecord, AuditService } from '../../modules/audit/audit.service';
import type { RealtimePublisher } from '../../modules/realtime/realtime.publisher';

type PendingEvent<TPayload> = {
  eventName: RealtimeEvent;
  payload: TPayload;
  requestId?: string;
  room: string;
};

/**
 * Collects realtime events and audit records during a database transaction
 * so they can be flushed atomically only after the transaction commits.
 * Discarded if the transaction rolls back.
 */
export class EventCollector {
  private readonly events: PendingEvent<unknown>[] = [];
  private readonly audits: AuditRecord[] = [];

  constructor(
    private readonly publisher: RealtimePublisher,
    private readonly auditService: AuditService,
  ) {}

  publish<TPayload>(
    room: string,
    eventName: RealtimeEvent,
    payload: TPayload,
    requestId?: string,
  ): void {
    this.events.push({ eventName, payload: payload as unknown, requestId, room });
  }

  audit(record: AuditRecord): void {
    this.audits.push(record);
  }

  async flush(): Promise<void> {
    for (const record of this.audits) {
      await this.auditService.record(record);
    }

    for (const event of this.events) {
      this.publisher.publishToRoom(event.room, event.eventName, event.payload, event.requestId);
    }
  }
}
