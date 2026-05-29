import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { AppError } from '../../common/errors/app-error';
import { PersistenceCoordinator } from '../../common/persistence/persistence-coordinator.service';
import { PrismaService } from '../../common/persistence/prisma.service';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MessagesRepository } from './messages.repository';
import { MessagesService } from './messages.service';

const now = new Date('2026-05-03T00:00:00.000Z');
const user = { accountStatus: 'active', sessionId: sessionId(), userId: userId(1) };

describe('MessagesService', () => {
  let notificationsService: jest.Mocked<NotificationsService>;
  let permissionsService: jest.Mocked<PermissionsService>;
  let prisma: { $executeRaw: jest.Mock; $queryRaw: jest.Mock };
  let messagesRepo: jest.Mocked<MessagesRepository>;
  let events: { audit: jest.Mock; publish: jest.Mock };
  let persistence: { runWithEvents: jest.Mock };
  let service: MessagesService;
  let tx: { $executeRaw: jest.Mock; $queryRaw: jest.Mock };

  beforeEach(() => {
    notificationsService = {
      createNotification: jest.fn().mockResolvedValue({
        created: false,
        notification: { userId: userId(2) },
      }),
      publishCreated: jest.fn(),
    } as unknown as jest.Mocked<NotificationsService>;
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
    };
    messagesRepo = {
      findActiveTextChannel: jest.fn(),
      findDirectConversationForUser: jest.fn(),
      findExistingChannelMessage: jest.fn(),
      findExistingDirectMessage: jest.fn(),
      insertMessage: jest.fn(),
      findMessageById: jest.fn(),
      findReadyMessageAttachment: jest.fn(),
      findServerMembership: jest.fn(),
      insertMessageAttachments: jest.fn().mockResolvedValue(undefined),
      insertMessageMentions: jest.fn().mockResolvedValue(undefined),
      updateDirectConversationLastMessage: jest.fn().mockResolvedValue(undefined),
      markSenderReadChannel: jest.fn().mockResolvedValue(undefined),
      markSenderReadDirect: jest.fn().mockResolvedValue(undefined),
      incrementChannelUnread: jest.fn(),
      incrementDirectUnread: jest.fn(),
      loadChannelMessages: jest.fn(),
      loadDirectMessages: jest.fn(),
      loadMessageAttachments: jest.fn().mockResolvedValue([]),
      loadMessageMentions: jest.fn().mockResolvedValue([]),
      ensureChannelReadState: jest.fn(),
      ensureDirectReadState: jest.fn(),
      upsertChannelReadStateAtMessage: jest.fn(),
      upsertDirectReadStateAtMessage: jest.fn(),
      findMessageInScope: jest.fn(),
      findVisibleMessageWithDeletion: jest.fn(),
      markMessageDeleted: jest.fn(),
      recomputeChannelUnreadAfterDelete: jest.fn(),
      recomputeDirectUnreadAfterDelete: jest.fn(),
      findCurrentReadState: jest.fn(),
    } as unknown as jest.Mocked<MessagesRepository>;
    events = { audit: jest.fn(), publish: jest.fn() };
    persistence = {
      runWithEvents: jest.fn(
        async (fn: (transaction: typeof tx, collector: typeof events) => Promise<unknown>) =>
          fn(tx, events),
      ),
    };
    service = new MessagesService(
      messagesRepo,
      notificationsService,
      permissionsService,
      persistence as unknown as PersistenceCoordinator,
      prisma as unknown as PrismaService,
    );
  });

  it('sends channel messages, increments unread, and publishes realtime events', async () => {
    messagesRepo.findActiveTextChannel.mockResolvedValueOnce({ channelId: channelId(), serverId: serverId() });
    messagesRepo.insertMessage.mockResolvedValueOnce(messageRow());
    messagesRepo.incrementChannelUnread.mockResolvedValueOnce([
      { lastReadMessageId: null, unreadCount: 1, userId: userId(2) },
    ]);

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
    expect(events.publish).toHaveBeenCalledWith(
      `channel:${channelId()}`,
      RealtimeEvent.MessageCreated,
      expect.objectContaining({ message_id: messageId() }),
      'request-1',
    );
    expect(events.publish).toHaveBeenCalledWith(
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

    expect(persistence.runWithEvents).not.toHaveBeenCalled();
  });

  it('rejects illegal message attachments', async () => {
    messagesRepo.findActiveTextChannel.mockResolvedValueOnce({ channelId: channelId(), serverId: serverId() });
    messagesRepo.findReadyMessageAttachment.mockResolvedValueOnce(null);

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
