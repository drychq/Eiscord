import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { AppError } from '../../core/errors/app-error';
import { PersistenceCoordinator } from '../../infra/persistence/persistence-coordinator.service';
import { PrismaService } from '../../infra/persistence/prisma.service';
import { PermissionsService } from '../../core/permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { VoiceService } from '../voice/voice.service';
import { ServersRepository } from './servers.repository';
import { ServersService } from './servers.service';

const now = new Date('2026-05-03T00:00:00.000Z');
const alice = { accountStatus: 'active', sessionId: 'session-1', userId: userId(1) };
const bob = { accountStatus: 'active', sessionId: 'session-2', userId: userId(2) };

describe('ServersService', () => {
  let auditService: jest.Mocked<AuditService>;
  let notificationsService: { createNotification: jest.Mock; publishCreated: jest.Mock };
  let prisma: { $executeRaw: jest.Mock; $queryRaw: jest.Mock };
  let permissionsService: jest.Mocked<PermissionsService>;
  let realtimePublisher: jest.Mocked<RealtimePublisher>;
  let serversRepo: jest.Mocked<ServersRepository>;
  let voiceService: jest.Mocked<VoiceService>;
  let events: { audit: jest.Mock; publish: jest.Mock };
  let persistence: { runWithEvents: jest.Mock };
  let service: ServersService;
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
    notificationsService = {
      createNotification: jest.fn().mockResolvedValue({ created: false, notification: {} }),
      publishCreated: jest.fn(),
    };
    permissionsService = {
      checkAllowed: jest.fn().mockResolvedValue({ allowed: true }),
    } as unknown as jest.Mocked<PermissionsService>;
    realtimePublisher = {
      publishToRoom: jest.fn(),
      leaveUserRooms: jest.fn(),
    } as unknown as jest.Mocked<RealtimePublisher>;
    serversRepo = {
      findReadyServerIconAttachment: jest.fn(),
      insertServer: jest.fn(),
      insertOwnerMembership: jest.fn(),
      insertDefaultRole: jest.fn(),
      insertMembershipRole: jest.fn().mockResolvedValue(undefined),
      insertMembershipRoleIgnoreConflict: jest.fn().mockResolvedValue(undefined),
      insertDefaultChannel: jest.fn(),
      insertChannelReadState: jest.fn().mockResolvedValue(undefined),
      insertInvitation: jest.fn().mockResolvedValue(undefined),
      listMembershipServers: jest.fn().mockResolvedValue([]),
      getInvitationForUpdate: jest.fn(),
      getDefaultRole: jest.fn(),
      getMembershipForUpdate: jest.fn(),
      createMembership: jest.fn(),
      restoreMembership: jest.fn(),
      insertTextChannelReadStates: jest.fn().mockResolvedValue(undefined),
      incrementInvitationUseCount: jest.fn().mockResolvedValue(undefined),
      getServerMembershipForUpdate: jest.fn(),
      deleteAllMembershipRoles: jest.fn().mockResolvedValue(undefined),
      markMembershipRemoved: jest.fn().mockResolvedValue(undefined),
      updateMembershipStatus: jest.fn(),
      getActiveServerMembership: jest.fn(),
      listActiveChannelsByServer: jest.fn().mockResolvedValue([]),
      listRoleRows: jest.fn().mockResolvedValue([]),
      listPermissionOverwritesForChannels: jest.fn().mockResolvedValue([]),
      listServerMembersRows: jest.fn().mockResolvedValue([]),
      getMemberRowById: jest.fn(),
      getRoleRow: jest.fn(),
      insertRole: jest.fn(),
      updateRoleRow: jest.fn(),
      deleteRoleRow: jest.fn().mockResolvedValue(undefined),
      deleteMembershipRole: jest.fn().mockResolvedValue(undefined),
      listServerUserIds: jest.fn().mockResolvedValue([]),
      listServerChannels: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ServersRepository>;
    voiceService = {
      releaseUserActiveSessionForServer: jest.fn().mockResolvedValue(null),
      releaseUsersActiveSessionsWithoutJoinPermission: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<VoiceService>;
    events = { audit: jest.fn(), publish: jest.fn() };
    persistence = {
      runWithEvents: jest.fn(
        async (fn: (transaction: typeof tx, collector: typeof events) => Promise<unknown>) =>
          fn(tx, events),
      ),
    };
    service = new ServersService(
      auditService,
      notificationsService as unknown as NotificationsService,
      permissionsService,
      persistence as unknown as PersistenceCoordinator,
      prisma as unknown as PrismaService,
      realtimePublisher,
      serversRepo,
      voiceService,
    );
  });

  it('creates a server with owner membership, default role, default channel, and invite', async () => {
    serversRepo.insertServer.mockResolvedValueOnce(serverRow());
    serversRepo.insertOwnerMembership.mockResolvedValueOnce(memberRow());
    serversRepo.insertDefaultRole.mockResolvedValueOnce(roleRow());
    serversRepo.insertDefaultChannel.mockResolvedValueOnce(channelRow());

    const result = await service.createServer(
      alice,
      { description: ' Software engineering ', name: ' Course ' },
      'request-1',
    );

    expect(result).toMatchObject({
      default_channel: { name: 'general', type: 'text' },
      default_role: { is_default: true, name: 'Member' },
      owner_member: { membership_id: membershipId(), role_ids: [roleId()] },
      server: { name: 'Course', server_id: serverId() },
    });
    expect(result.invite_code).toEqual(expect.any(String));
    expect(events.publish).toHaveBeenCalledWith(
      `server:${serverId()}`,
      RealtimeEvent.MemberJoined,
      expect.objectContaining({ server_id: serverId() }),
      'request-1',
    );
  });

  it('rejects invalid server icon attachments', async () => {
    serversRepo.findReadyServerIconAttachment.mockResolvedValueOnce(null);

    await expect(
      service.createServer(alice, {
        icon_attachment_id: attachmentId(),
        name: 'Course',
      }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.ResourceNotFound });

    expect(persistence.runWithEvents).not.toHaveBeenCalled();
  });

  it('joins a server by active invite', async () => {
    serversRepo.getInvitationForUpdate.mockResolvedValueOnce(invitationRow());
    serversRepo.getDefaultRole.mockResolvedValueOnce(roleRow());
    serversRepo.getMembershipForUpdate.mockResolvedValueOnce(null);
    serversRepo.createMembership.mockResolvedValueOnce(membershipLookup({ userId: bob.userId }));
    serversRepo.getActiveServerMembership.mockResolvedValueOnce({
      ...serverRow(),
      ...memberRow({ userId: bob.userId }),
    });
    serversRepo.listActiveChannelsByServer.mockResolvedValueOnce([channelRow()]);
    serversRepo.listServerMembersRows.mockResolvedValueOnce([memberRow({ userId: bob.userId })]);
    serversRepo.listRoleRows.mockResolvedValueOnce([roleRow()]);
    serversRepo.listPermissionOverwritesForChannels.mockResolvedValueOnce([]);

    const result = await service.joinServer(bob, { invite_code: 'abc123' }, 'request-1');

    expect(result).toMatchObject({
      current_member: { user: { user_id: bob.userId } },
      server_id: serverId(),
    });
    expect(events.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'JoinServer', result: 'success' }),
    );
  });

  it('rejects missing invites', async () => {
    serversRepo.getInvitationForUpdate.mockResolvedValueOnce(null);

    await expect(
      service.joinServer(bob, { invite_code: 'missing' }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.ResourceNotFound });
  });

  it('rejects expired invites', async () => {
    serversRepo.getInvitationForUpdate.mockResolvedValueOnce(
      invitationRow({ expiresAt: new Date('2026-01-01T00:00:00.000Z') }),
    );

    await expect(
      service.joinServer(bob, { invite_code: 'expired' }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.Conflict });
  });

  it('rejects invites that reached their use limit', async () => {
    serversRepo.getInvitationForUpdate.mockResolvedValueOnce(
      invitationRow({ maxUses: 1, usedCount: 1 }),
    );

    await expect(
      service.joinServer(bob, { invite_code: 'usedup' }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.Conflict });
  });

  it('rejects duplicate active memberships when joining', async () => {
    serversRepo.getInvitationForUpdate.mockResolvedValueOnce(invitationRow());
    serversRepo.getDefaultRole.mockResolvedValueOnce(roleRow());
    serversRepo.getMembershipForUpdate.mockResolvedValueOnce(
      membershipLookup({ memberStatus: 'active', userId: bob.userId }),
    );

    await expect(
      service.joinServer(bob, { invite_code: 'abc123' }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.Conflict });
  });

  it('prevents owners from leaving before ownership transfer', async () => {
    serversRepo.getServerMembershipForUpdate.mockResolvedValueOnce(
      serverMembershipRow({ membershipId: membershipId(), ownerId: alice.userId }),
    );

    await expect(service.leaveServer(alice, serverId())).rejects.toMatchObject<AppError>({
      code: ErrorCode.Conflict,
    });
  });

  it('lets ordinary members leave servers', async () => {
    serversRepo.getServerMembershipForUpdate.mockResolvedValueOnce(
      serverMembershipRow({ membershipId: membershipId(), ownerId: alice.userId }),
    );
    serversRepo.listServerChannels.mockResolvedValueOnce([]);

    await expect(service.leaveServer(bob, serverId(), 'request-1')).resolves.toEqual({ ok: true });

    expect(events.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LeaveServer', result: 'success' }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      `server:${serverId()}`,
      RealtimeEvent.MemberChanged,
      expect.objectContaining({ change_type: 'left' }),
      'request-1',
    );
  });

  it('mutes a member via manageMember', async () => {
    const targetUserId = userId(2);
    permissionsService.assertCanManageMember = jest.fn().mockResolvedValue({
      userId: targetUserId,
      highestPriority: 0,
    });
    serversRepo.updateMembershipStatus.mockResolvedValueOnce(
      memberRow({ userId: targetUserId, memberStatus: 'muted' }),
    );
    serversRepo.getMemberRowById.mockResolvedValueOnce(
      memberRow({ userId: targetUserId, memberStatus: 'muted' }),
    );

    await expect(
      service.manageMember(alice, serverId(), membershipId(), { action: 'mute' }, 'request-1'),
    ).resolves.toMatchObject({ member_status: 'muted' });

    expect(events.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ManageMember:mute' }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      expect.stringContaining('server:'),
      RealtimeEvent.MemberChanged,
      expect.objectContaining({ change_type: 'member_mute' }),
      'request-1',
    );
  });
});

function userId(index: number): string {
  return `00000000-0000-4000-8000-00000000000${index}`;
}

function serverId(): string {
  return '00000000-0000-4000-8000-000000000101';
}

function membershipId(): string {
  return '00000000-0000-4000-8000-000000000201';
}

function roleId(): string {
  return '00000000-0000-4000-8000-000000000301';
}

function channelId(): string {
  return '00000000-0000-4000-8000-000000000401';
}

function attachmentId(): string {
  return '00000000-0000-4000-8000-000000000501';
}

function serverRow(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: now,
    description: 'Software engineering',
    iconAttachmentId: null,
    id: serverId(),
    name: 'Course',
    ownerId: alice.userId,
    status: 'active',
    ...overrides,
  };
}

function memberRow(overrides: Record<string, unknown> = {}) {
  const user = String(overrides.userId ?? alice.userId);

  return {
    avatarAttachmentId: null,
    joinedAt: now,
    memberStatus: 'active',
    membershipId: membershipId(),
    nickInServer: 'Alice',
    presenceStatus: 'offline',
    roleIds: [],
    serverId: serverId(),
    userId: user,
    userNickname: user === alice.userId ? 'Alice' : 'Bob',
    username: user === alice.userId ? 'alice' : 'bob',
    ...overrides,
  };
}

function roleRow(overrides: Record<string, unknown> = {}) {
  return {
    color: null,
    id: roleId(),
    isDefault: true,
    name: 'Member',
    permissionBits: BigInt(0),
    priority: 0,
    serverId: serverId(),
    ...overrides,
  };
}

function channelRow(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: now,
    id: channelId(),
    name: 'general',
    serverId: serverId(),
    sortOrder: 0,
    status: 'active',
    topic: null,
    type: 'text',
    ...overrides,
  };
}

function invitationRow(overrides: Record<string, unknown> = {}) {
  return {
    code: 'abc123',
    expiresAt: null,
    id: '00000000-0000-4000-8000-000000000601',
    maxUses: null,
    serverId: serverId(),
    serverStatus: 'active',
    status: 'active',
    usedCount: 0,
    ...overrides,
  };
}

function membershipLookup(overrides: Record<string, unknown> = {}) {
  return {
    id: membershipId(),
    memberStatus: 'active',
    serverId: serverId(),
    userId: bob.userId,
    ...overrides,
  };
}

function serverMembershipRow(overrides: Record<string, unknown> = {}) {
  return {
    ...serverRow(),
    membershipId: membershipId(),
    membershipStatus: 'active',
    ...overrides,
  };
}
