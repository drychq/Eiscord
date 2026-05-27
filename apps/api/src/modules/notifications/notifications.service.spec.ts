import type { EventCollector } from '../../common/persistence/event-collector';
import { PrismaService } from '../../common/persistence/prisma.service';
import { NotificationsService } from './notifications.service';

const now = new Date('2026-05-03T00:00:00.000Z');

describe('NotificationsService', () => {
  let prisma: { $executeRaw: jest.Mock; $queryRaw: jest.Mock };
  let events: jest.Mocked<EventCollector>;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = {
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn(),
    };
    events = {
      publish: jest.fn(),
      audit: jest.fn(),
    } as unknown as jest.Mocked<EventCollector>;
    service = new NotificationsService(prisma as unknown as PrismaService);
  });

  it('creates notifications and publishes to the recipient user room', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([notificationRow()]);

    const result = await service.createNotification(prisma as unknown as PrismaService, {
      contentPreview: 'New message',
      dedupeKey: 'message-1:user-1',
      sourceId: sourceId(),
      sourceType: 'message',
      type: 'direct_message',
      userId: userId(),
    });

    expect(result.created).toBe(true);
    service.publishCreated(events, result.notification, 'request-1');
    expect(events.publish).toHaveBeenCalledWith(
      `user:${userId()}`,
      'NotificationCreated',
      expect.objectContaining({ notification_id: notificationId() }),
      'request-1',
    );
  });

  it('returns existing notifications on dedupe conflicts without marking them created', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);
    prisma.$queryRaw.mockResolvedValueOnce([notificationRow()]);

    const result = await service.createNotification(prisma as unknown as PrismaService, {
      contentPreview: 'New message',
      dedupeKey: 'message-1:user-1',
      sourceId: sourceId(),
      sourceType: 'message',
      type: 'direct_message',
      userId: userId(),
    });

    expect(result).toMatchObject({ created: false, notification: { id: notificationId() } });
  });

  it('marks all unread notifications for the current user', async () => {
    prisma.$executeRaw.mockResolvedValueOnce(3);

    await expect(
      service.markRead(
        { accountStatus: 'active', sessionId: sessionId(), userId: userId() },
        { mark_all: true },
      ),
    ).resolves.toEqual({ updated_count: 3 });
  });
});

function userId(): string {
  return '00000000-0000-4000-8000-000000000001';
}

function sessionId(): string {
  return '00000000-0000-4000-8000-000000000101';
}

function sourceId(): string {
  return '00000000-0000-4000-8000-000000000201';
}

function notificationId(): string {
  return '00000000-0000-4000-8000-000000000301';
}

function notificationRow(overrides: Record<string, unknown> = {}) {
  return {
    contentPreview: 'New message',
    createdAt: now,
    dedupeKey: 'message-1:user-1',
    id: notificationId(),
    isRead: false,
    readAt: null,
    sourceId: sourceId(),
    sourceType: 'message',
    type: 'direct_message',
    userId: userId(),
    ...overrides,
  };
}
