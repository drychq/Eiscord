import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { AppError } from '../../common/errors/app-error';
import { PersistenceCoordinator } from '../../common/persistence/persistence-coordinator.service';
import { PrismaService } from '../../common/persistence/prisma.service';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { VoiceService } from '../voice/voice.service';
import { ChannelsRepository } from './channels.repository';
import { ChannelsService } from './channels.service';

const now = new Date('2026-05-03T00:00:00.000Z');
const user = { accountStatus: 'active', sessionId: sessionId(), userId: userId() };

describe('ChannelsService', () => {
  let auditService: jest.Mocked<AuditService>;
  let channelsRepo: jest.Mocked<ChannelsRepository>;
  let notificationsService: { createNotification: jest.Mock; publishCreated: jest.Mock };
  let prisma: { $executeRaw: jest.Mock; $queryRaw: jest.Mock };
  let permissionsService: jest.Mocked<PermissionsService>;
  let realtimePublisher: jest.Mocked<RealtimePublisher>;
  let voiceService: jest.Mocked<VoiceService>;
  let events: { audit: jest.Mock; publish: jest.Mock };
  let persistence: { runWithEvents: jest.Mock };
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
    };
    channelsRepo = {
      insertChannel: jest.fn(),
      seedChannelReadStates: jest.fn().mockResolvedValue(undefined),
      updateChannel: jest.fn(),
      markChannelDeleted: jest.fn(),
      findActiveChannelForMember: jest.fn(),
      deletePermissionOverwrites: jest.fn().mockResolvedValue(undefined),
      insertPermissionOverwrite: jest.fn().mockResolvedValue(undefined),
      findRoleInServer: jest.fn(),
      findActiveMembership: jest.fn(),
      listPermissionOverwrites: jest.fn().mockResolvedValue([]),
      listServerActiveUserIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ChannelsRepository>;
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
    events = { audit: jest.fn(), publish: jest.fn() };
    persistence = {
      runWithEvents: jest.fn(
        async (fn: (transaction: typeof tx, collector: typeof events) => Promise<unknown>) =>
          fn(tx, events),
      ),
    };
    service = new ChannelsService(
      auditService,
      channelsRepo,
      notificationsService as unknown as NotificationsService,
      permissionsService,
      persistence as unknown as PersistenceCoordinator,
      prisma as unknown as PrismaService,
      realtimePublisher,
      voiceService,
    );
  });

  it('creates channels for server members and publishes channel changes', async () => {
    channelsRepo.insertChannel.mockResolvedValueOnce(channelRow({ name: 'general' }));
    channelsRepo.listPermissionOverwrites.mockResolvedValueOnce([]);

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
    expect(events.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CreateChannel', result: 'success' }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      `server:${serverId()}`,
      RealtimeEvent.ChannelChanged,
      expect.objectContaining({ change_type: 'created' }),
      'request-1',
    );
  });

  it('accepts permission overwrites in M4', async () => {
    channelsRepo.insertChannel.mockResolvedValueOnce(channelRow({ name: 'private' }));
    channelsRepo.findRoleInServer.mockResolvedValueOnce({ id: roleId() });
    channelsRepo.listPermissionOverwrites.mockResolvedValueOnce([
      {
        allowBits: '0',
        channelId: channelId(),
        denyBits: '1',
        id: overwriteId(),
        targetId: roleId(),
        targetType: 'role',
      },
    ]);
    channelsRepo.listServerActiveUserIds.mockResolvedValueOnce([userId()]);

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

    expect(persistence.runWithEvents).not.toHaveBeenCalled();
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
