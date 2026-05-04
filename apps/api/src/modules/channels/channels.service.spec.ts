import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { VoiceService } from '../voice/voice.service';
import { ChannelsService } from './channels.service';

const now = new Date('2026-05-03T00:00:00.000Z');
const user = { accountStatus: 'active', sessionId: sessionId(), userId: userId() };

describe('ChannelsService', () => {
  let auditService: jest.Mocked<AuditService>;
  let notificationsService: { createNotification: jest.Mock; publishCreated: jest.Mock };
  let prisma: {
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let permissionsService: jest.Mocked<PermissionsService>;
  let realtimePublisher: jest.Mocked<RealtimePublisher>;
  let voiceService: jest.Mocked<VoiceService>;
  let service: ChannelsService;
  let tx: { $executeRaw: jest.Mock; $queryRaw: jest.Mock };

  beforeEach(() => {
    auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn(),
    };
    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn(),
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    notificationsService = {
      createNotification: jest.fn().mockResolvedValue({ created: false, notification: {} }),
      publishCreated: jest.fn(),
    };
    permissionsService = {
      assertAllowed: jest.fn().mockResolvedValue(undefined),
      listUsersWithChannelPermission: jest.fn().mockResolvedValue([userId()]),
    } as unknown as jest.Mocked<PermissionsService>;
    realtimePublisher = {
      publishToRoom: jest.fn(),
      leaveUserRooms: jest.fn(),
    } as unknown as jest.Mocked<RealtimePublisher>;
    voiceService = {
      releaseChannelActiveSessions: jest.fn().mockResolvedValue([]),
      releaseUsersActiveSessionsForChannel: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<VoiceService>;
    service = new ChannelsService(
      auditService,
      notificationsService as unknown as NotificationsService,
      permissionsService,
      prisma as unknown as PrismaService,
      realtimePublisher,
      voiceService,
    );
  });

  it('creates channels for server members and publishes channel changes', async () => {
    tx.$queryRaw.mockResolvedValueOnce([channelRow({ name: 'general' })]);
    tx.$queryRaw.mockResolvedValueOnce([]);

    const result = await service.createChannel(
      user,
      serverId(),
      { name: ' general ', sort_order: 10, topic: 'Chat', type: 'text' },
      'request-1',
    );

    expect(result).toMatchObject({
      channel_id: channelId(),
      name: 'general',
      sort_order: 10,
      type: 'text',
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CreateChannel', result: 'success' }),
    );
    expect(realtimePublisher.publishToRoom).toHaveBeenCalledWith(
      `server:${serverId()}`,
      RealtimeEvent.ChannelChanged,
      expect.objectContaining({ change_type: 'created' }),
      'request-1',
    );
  });

  it('accepts permission overwrites in M4', async () => {
    tx.$queryRaw.mockResolvedValueOnce([channelRow({ name: 'private' })]);
    tx.$queryRaw.mockResolvedValueOnce([{ id: roleId() }]);
    tx.$queryRaw.mockResolvedValueOnce([
      {
        allowBits: '0',
        channelId: channelId(),
        denyBits: '1',
        id: overwriteId(),
        targetId: roleId(),
        targetType: 'role',
      },
    ]);
    prisma.$queryRaw.mockResolvedValueOnce([{ userId: userId() }]);

    const result = await service.createChannel(
      user,
      serverId(),
      {
        name: 'private',
        permission_overwrites: [
          {
            allow_bits: '0',
            deny_bits: '1',
            target_id: roleId(),
            target_type: 'role',
          },
        ],
        type: 'text',
      },
      'request-1',
    );

    expect(result.permission_overwrites).toHaveLength(1);
    expect(realtimePublisher.leaveUserRooms).toHaveBeenCalled();
  });

  it('rejects non-members', async () => {
    permissionsService.assertAllowed.mockRejectedValueOnce(
      new AppError(ErrorCode.PermissionDenied, 'Permission denied.', 403),
    );

    await expect(
      service.createChannel(user, serverId(), { name: 'general', type: 'text' }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.PermissionDenied });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

function userId(): string {
  return '00000000-0000-4000-8000-000000000001';
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

function roleId(): string {
  return '00000000-0000-4000-8000-000000000401';
}

function overwriteId(): string {
  return '00000000-0000-4000-8000-000000000501';
}

function channelRow(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: now,
    id: channelId(),
    name: 'general',
    serverId: serverId(),
    sortOrder: 10,
    status: 'active',
    topic: null,
    type: 'text',
    ...overrides,
  };
}
