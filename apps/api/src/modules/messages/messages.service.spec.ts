import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { MessagesService } from './messages.service';

const now = new Date('2026-05-03T00:00:00.000Z');
const user = { accountStatus: 'active', sessionId: sessionId(), userId: userId(1) };

describe('MessagesService', () => {
  let notificationsService: jest.Mocked<NotificationsService>;
  let auditService: jest.Mocked<AuditService>;
  let permissionsService: jest.Mocked<PermissionsService>;
  let prisma: { $executeRaw: jest.Mock; $queryRaw: jest.Mock; $transaction: jest.Mock };
  let realtimePublisher: jest.Mocked<RealtimePublisher>;
  let service: MessagesService;
  let tx: { $executeRaw: jest.Mock; $queryRaw: jest.Mock };

  beforeEach(() => {
    notificationsService = {
      createNotification: jest.fn(),
      publishCreated: jest.fn(),
    } as unknown as jest.Mocked<NotificationsService>;
    auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    permissionsService = {
      assertAllowed: jest.fn().mockResolvedValue(undefined),
      listUsersWithChannelPermission: jest.fn().mockResolvedValue([userId(1), userId(2)]),
    } as unknown as jest.Mocked<PermissionsService>;
    tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn(),
    };
    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn(),
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    realtimePublisher = {
      publishToRoom: jest.fn(),
    } as unknown as jest.Mocked<RealtimePublisher>;
    service = new MessagesService(
      auditService,
      notificationsService,
      permissionsService,
      prisma as unknown as PrismaService,
      realtimePublisher,
    );
  });

  it('sends channel messages, increments unread, and publishes realtime events', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ channelId: channelId(), serverId: serverId() }]);
    tx.$queryRaw.mockResolvedValueOnce([messageRow()]);
    tx.$queryRaw.mockResolvedValueOnce([
      { lastReadMessageId: null, unreadCount: 1, userId: userId(2) },
    ]);
    prisma.$queryRaw.mockResolvedValueOnce([]);
    prisma.$queryRaw.mockResolvedValueOnce([]);

    const result = await service.sendChannelMessage(
      user,
      channelId(),
      { content: ' hello ' },
      'request-1',
    );

    expect(result).toMatchObject({
      channel_id: channelId(),
      content: 'hello',
      message_id: messageId(),
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(realtimePublisher.publishToRoom).toHaveBeenCalledWith(
      `channel:${channelId()}`,
      RealtimeEvent.MessageCreated,
      expect.objectContaining({ message_id: messageId() }),
      'request-1',
    );
    expect(realtimePublisher.publishToRoom).toHaveBeenCalledWith(
      `user:${userId(2)}`,
      RealtimeEvent.UnreadUpdated,
      expect.objectContaining({ unread_count: 1 }),
      'request-1',
    );
  });

  it('rejects empty messages without touching the database', async () => {
    await expect(
      service.sendChannelMessage(user, channelId(), { content: '   ' }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.ValidationFailed });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects illegal message attachments', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ channelId: channelId(), serverId: serverId() }]);
    tx.$queryRaw.mockResolvedValueOnce([]);

    await expect(
      service.sendChannelMessage(user, channelId(), {
        attachment_ids: [attachmentId()],
      }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.ResourceNotFound });
  });
});

function userId(index: number): string {
  return `00000000-0000-4000-8000-00000000000${index}`;
}

function sessionId(): string {
  return '00000000-0000-4000-8000-000000000101';
}

function serverId(): string {
  return '00000000-0000-4000-8000-000000000201';
}

function channelId(): string {
  return '00000000-0000-4000-8000-000000000301';
}

function messageId(): string {
  return '00000000-0000-4000-8000-000000000401';
}

function attachmentId(): string {
  return '00000000-0000-4000-8000-000000000501';
}

function messageRow(overrides: Record<string, unknown> = {}) {
  return {
    avatarAttachmentId: null,
    channelId: channelId(),
    content: 'hello',
    conversationId: null,
    createdAt: now,
    id: messageId(),
    scopeType: 'channel',
    senderId: user.userId,
    senderNickname: 'Alice',
    senderUsername: 'alice',
    visibility: 'visible',
    ...overrides,
  };
}
