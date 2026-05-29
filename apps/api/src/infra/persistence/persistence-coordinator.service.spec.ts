import { RealtimeEvent } from '@eiscord/shared';

import { AuditService } from '../../modules/audit/audit.service';
import { RealtimePublisher } from '../../modules/realtime/realtime.publisher';
import { PersistenceCoordinator } from './persistence-coordinator.service';
import { PrismaService } from './prisma.service';

describe('PersistenceCoordinator', () => {
  let auditService: jest.Mocked<AuditService>;
  let coordinator: PersistenceCoordinator;
  let prisma: { $transaction: jest.Mock };
  let publisher: jest.Mocked<RealtimePublisher>;
  let tx: object;

  beforeEach(() => {
    auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    publisher = {
      publishToRoom: jest.fn(),
    } as unknown as jest.Mocked<RealtimePublisher>;
    tx = {};
    prisma = {
      $transaction: jest.fn((callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };
    coordinator = new PersistenceCoordinator(
      auditService,
      prisma as unknown as PrismaService,
      publisher,
    );
  });

  it('flushes audits before realtime events when the transaction commits', async () => {
    const order: string[] = [];

    auditService.record.mockImplementation(async () => {
      order.push('audit');
    });
    publisher.publishToRoom.mockImplementation(() => {
      order.push('publish');
      return {} as ReturnType<RealtimePublisher['publishToRoom']>;
    });

    await coordinator.runWithEvents(async (_, events) => {
      events.publish('room:1', RealtimeEvent.MessageCreated, { id: '1' }, 'req-1');
      events.audit({ action: 'created', result: 'success' });
    });

    expect(auditService.record).toHaveBeenCalledWith({ action: 'created', result: 'success' });
    expect(publisher.publishToRoom).toHaveBeenCalledWith(
      'room:1',
      RealtimeEvent.MessageCreated,
      { id: '1' },
      'req-1',
    );
    expect(order).toEqual(['audit', 'publish']);
  });

  it('returns the callback result to the caller', async () => {
    const result = await coordinator.runWithEvents(async () => ({ value: 42 }));

    expect(result).toEqual({ value: 42 });
  });

  it('discards collected events when the transaction rolls back', async () => {
    await expect(
      coordinator.runWithEvents(async (_, events) => {
        events.publish('room:1', RealtimeEvent.MessageCreated, { id: '1' });
        events.audit({ action: 'failed', result: 'failure' });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');

    expect(auditService.record).not.toHaveBeenCalled();
    expect(publisher.publishToRoom).not.toHaveBeenCalled();
  });

  it('flushes multiple events in collection order', async () => {
    const seenEvents: string[] = [];

    publisher.publishToRoom.mockImplementation((room) => {
      seenEvents.push(room);
      return {} as ReturnType<RealtimePublisher['publishToRoom']>;
    });

    await coordinator.runWithEvents(async (_, events) => {
      events.publish('room:a', RealtimeEvent.MessageCreated, {});
      events.publish('room:b', RealtimeEvent.MessageCreated, {});
      events.publish('room:c', RealtimeEvent.MessageCreated, {});
    });

    expect(seenEvents).toEqual(['room:a', 'room:b', 'room:c']);
  });
});
