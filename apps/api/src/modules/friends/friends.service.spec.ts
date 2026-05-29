import { ErrorCode } from '@eiscord/shared';

import { AppError } from '../../core/errors/app-error';
import { PersistenceCoordinator } from '../../infra/persistence/persistence-coordinator.service';
import { PrismaService } from '../../infra/persistence/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { FriendsService } from './friends.service';

const now = new Date('2026-05-03T00:00:00.000Z');
const alice = { accountStatus: 'active', sessionId: 'session-1', userId: userId(1) };
const bobId = userId(2);

describe('FriendsService', () => {
  let auditService: jest.Mocked<AuditService>;
  let prisma: {
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let notificationsService: jest.Mocked<NotificationsService>;
  let service: FriendsService;
  let tx: { $executeRaw: jest.Mock; $queryRaw: jest.Mock };
  let events: { audit: jest.Mock; publish: jest.Mock };
  let persistence: { runWithEvents: jest.Mock };

  beforeEach(() => {
    auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    tx = {
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn(),
    };
    prisma = {
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn(),
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    notificationsService = {
      createNotification: jest.fn().mockResolvedValue({
        created: true,
        notification: {
          contentPreview: 'New friend request',
          createdAt: now,
          dedupeKey: 'friendship-1',
          id: notificationId(),
          isRead: false,
          readAt: null,
          sourceId: friendshipId(),
          sourceType: 'friendship',
          type: 'friend_request',
          userId: bobId,
        },
      }),
      publishCreated: jest.fn(),
    } as unknown as jest.Mocked<NotificationsService>;
    events = { audit: jest.fn(), publish: jest.fn() };
    persistence = {
      runWithEvents: jest.fn(
        async (fn: (transaction: typeof tx, collector: typeof events) => Promise<unknown>) =>
          fn(tx, events),
      ),
    };
    service = new FriendsService(
      auditService,
      notificationsService,
      persistence as unknown as PersistenceCoordinator,
      prisma as unknown as PrismaService,
    );
  });

  it('creates friend requests and notifies the addressee', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([friendUserRow()]);
    prisma.$queryRaw.mockResolvedValueOnce([]);
    tx.$queryRaw.mockResolvedValueOnce([friendshipRecord({ status: 'pending' })]);
    prisma.$queryRaw.mockResolvedValueOnce([friendshipRow({ status: 'pending' })]);

    const result = await service.createFriendRequest(
      alice,
      { target_user_id: bobId, message: 'hi' },
      'request-1',
    );

    expect(result).toMatchObject({
      direction: 'outgoing',
      friend: { user_id: bobId },
      status: 'pending',
    });
    expect(events.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CreateFriendRequest', result: 'success' }),
    );
    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: 'friend_request', userId: bobId }),
    );
    expect(notificationsService.publishCreated).toHaveBeenCalledWith(
      events,
      expect.any(Object),
      'request-1',
    );
  });

  it('creates friend requests by username', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([friendUserRow()]);
    prisma.$queryRaw.mockResolvedValueOnce([]);
    tx.$queryRaw.mockResolvedValueOnce([friendshipRecord({ status: 'pending' })]);
    prisma.$queryRaw.mockResolvedValueOnce([friendshipRow({ status: 'pending' })]);

    const result = await service.createFriendRequest(
      alice,
      { target_username: 'Bob' },
      'request-1',
    );

    expect(result).toMatchObject({
      direction: 'outgoing',
      friend: { user_id: bobId },
      status: 'pending',
    });
    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: 'friend_request', userId: bobId }),
    );
  });

  it('rejects self friend requests', async () => {
    await expect(
      service.createFriendRequest(alice, { target_user_id: alice.userId }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.ValidationFailed });

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CreateFriendRequest', result: 'failure' }),
    );
  });

  it('rejects friend requests with more than one target identifier', async () => {
    await expect(
      service.createFriendRequest(alice, {
        target_user_id: bobId,
        target_username: 'bob',
      }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.ValidationFailed });

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CreateFriendRequest',
        failureReason: 'invalid_target',
        result: 'failure',
      }),
    );
  });

  it('rejects duplicate active friendships', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([friendUserRow()]);
    prisma.$queryRaw.mockResolvedValueOnce([{ id: 'friendship-1', status: 'pending' }]);

    await expect(
      service.createFriendRequest(alice, { target_user_id: bobId }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.Conflict });
  });

  it('accepts pending requests and creates or reuses a direct conversation', async () => {
    tx.$queryRaw.mockResolvedValueOnce([
      friendshipRecord({ addresseeId: alice.userId, requesterId: bobId, status: 'pending' }),
    ]);
    tx.$queryRaw.mockResolvedValueOnce([
      friendshipRecord({ addresseeId: alice.userId, requesterId: bobId, status: 'accepted' }),
    ]);
    tx.$queryRaw.mockResolvedValueOnce([
      {
        id: conversationId(),
        lastMessageId: null,
        participantAId: alice.userId,
        participantBId: bobId,
      },
    ]);
    prisma.$queryRaw.mockResolvedValueOnce([
      friendshipRow({
        addresseeId: alice.userId,
        conversationId: conversationId(),
        requesterId: bobId,
        status: 'accepted',
      }),
    ]);

    const result = await service.acceptFriendRequest(alice, friendshipId(), 'request-1');

    expect(result).toMatchObject({
      conversation_id: conversationId(),
      direction: 'incoming',
      status: 'accepted',
    });
    expect(events.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AcceptFriendRequest', result: 'success' }),
    );
  });

  it('rejects handling someone else request', async () => {
    tx.$queryRaw.mockResolvedValueOnce([
      friendshipRecord({ addresseeId: userId(3), requesterId: bobId, status: 'pending' }),
    ]);

    await expect(
      service.acceptFriendRequest(alice, friendshipId()),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.PermissionDenied });
  });

  it('rejects repeated request handling', async () => {
    tx.$queryRaw.mockResolvedValueOnce([
      friendshipRecord({ addresseeId: alice.userId, requesterId: bobId, status: 'accepted' }),
    ]);

    await expect(
      service.rejectFriendRequest(alice, friendshipId()),
    ).rejects.toMatchObject<AppError>({
      code: ErrorCode.Conflict,
    });
  });
});

function userId(index: number): string {
  return `00000000-0000-4000-8000-00000000000${index}`;
}

function friendshipId(): string {
  return '00000000-0000-4000-8000-000000000101';
}

function notificationId(): string {
  return '00000000-0000-4000-8000-000000000105';
}

function conversationId(): string {
  return '00000000-0000-4000-8000-000000000201';
}

function friendUserRow() {
  return {
    friendAccountStatus: 'active',
    friendAvatarAttachmentId: null,
    friendBio: null,
    friendCreatedAt: now,
    friendId: bobId,
    friendNickname: 'bob',
    friendPresenceStatus: 'offline',
    friendUsername: 'bob',
  };
}

function friendshipRecord(overrides: Partial<ReturnType<typeof baseFriendshipRecord>> = {}) {
  return {
    ...baseFriendshipRecord(),
    ...overrides,
  };
}

function baseFriendshipRecord() {
  return {
    addresseeId: bobId,
    createdAt: now,
    id: friendshipId(),
    requesterId: alice.userId,
    status: 'pending',
    updatedAt: now,
  };
}

function friendshipRow(overrides: Record<string, unknown> = {}) {
  return {
    ...friendUserRow(),
    addresseeId: bobId,
    conversationId: null,
    friendshipId: friendshipId(),
    requesterId: alice.userId,
    status: 'pending',
    ...overrides,
  };
}
