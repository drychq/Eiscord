import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { ServersService } from './servers.service';

const now = new Date('2026-05-03T00:00:00.000Z');
const alice = { accountStatus: 'active', sessionId: 'session-1', userId: userId(1) };
const bob = { accountStatus: 'active', sessionId: 'session-2', userId: userId(2) };

describe('ServersService', () => {
  let auditService: jest.Mocked<AuditService>;
  let prisma: {
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let permissionsService: jest.Mocked<PermissionsService>;
  let realtimePublisher: jest.Mocked<RealtimePublisher>;
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
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    permissionsService = {
      checkAllowed: jest.fn().mockResolvedValue({ allowed: true }),
    } as unknown as jest.Mocked<PermissionsService>;
    realtimePublisher = {
      publishToRoom: jest.fn(),
      leaveUserRooms: jest.fn(),
    } as unknown as jest.Mocked<RealtimePublisher>;
    service = new ServersService(
      auditService,
      permissionsService,
      prisma as unknown as PrismaService,
      realtimePublisher,
    );
  });

  it('creates a server with owner membership, default role, default channel, and invite', async () => {
    tx.$queryRaw.mockResolvedValueOnce([serverRow()]);
    tx.$queryRaw.mockResolvedValueOnce([memberRow()]);
    tx.$queryRaw.mockResolvedValueOnce([roleRow()]);
    tx.$queryRaw.mockResolvedValueOnce([channelRow()]);

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
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
    expect(realtimePublisher.publishToRoom).toHaveBeenCalledWith(
      `server:${serverId()}`,
      RealtimeEvent.MemberJoined,
      expect.objectContaining({ server_id: serverId() }),
      'request-1',
    );
  });

  it('rejects invalid server icon attachments', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await expect(
      service.createServer(alice, {
        icon_attachment_id: attachmentId(),
        name: 'Course',
      }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.ResourceNotFound });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('joins a server by active invite', async () => {
    tx.$queryRaw.mockResolvedValueOnce([invitationRow()]);
    tx.$queryRaw.mockResolvedValueOnce([roleRow()]);
    tx.$queryRaw.mockResolvedValueOnce([]);
    tx.$queryRaw.mockResolvedValueOnce([membershipLookup({ userId: bob.userId })]);
    mockServerDetailQueries(bob.userId);

    const result = await service.joinServer(bob, { invite_code: 'abc123' }, 'request-1');

    expect(result).toMatchObject({
      current_member: { user: { user_id: bob.userId } },
      server_id: serverId(),
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'JoinServer', result: 'success' }),
    );
  });

  it('rejects missing invites', async () => {
    tx.$queryRaw.mockResolvedValueOnce([]);

    await expect(
      service.joinServer(bob, { invite_code: 'missing' }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.ResourceNotFound });
  });

  it('rejects expired invites', async () => {
    tx.$queryRaw.mockResolvedValueOnce([
      invitationRow({ expiresAt: new Date('2026-01-01T00:00:00.000Z') }),
    ]);

    await expect(
      service.joinServer(bob, { invite_code: 'expired' }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.Conflict });
  });

  it('rejects invites that reached their use limit', async () => {
    tx.$queryRaw.mockResolvedValueOnce([invitationRow({ maxUses: 1, usedCount: 1 })]);

    await expect(
      service.joinServer(bob, { invite_code: 'usedup' }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.Conflict });
  });

  it('rejects duplicate active memberships when joining', async () => {
    tx.$queryRaw.mockResolvedValueOnce([invitationRow()]);
    tx.$queryRaw.mockResolvedValueOnce([roleRow()]);
    tx.$queryRaw.mockResolvedValueOnce([
      membershipLookup({ memberStatus: 'active', userId: bob.userId }),
    ]);

    await expect(
      service.joinServer(bob, { invite_code: 'abc123' }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.Conflict });
  });

  it('prevents owners from leaving before ownership transfer', async () => {
    tx.$queryRaw.mockResolvedValueOnce([
      serverMembershipRow({ membershipId: membershipId(), ownerId: alice.userId }),
    ]);

    await expect(service.leaveServer(alice, serverId())).rejects.toMatchObject<AppError>({
      code: ErrorCode.Conflict,
    });
  });

  it('lets ordinary members leave servers', async () => {
    tx.$queryRaw.mockResolvedValueOnce([
      serverMembershipRow({ membershipId: membershipId(), ownerId: alice.userId }),
    ]);

    await expect(service.leaveServer(bob, serverId(), 'request-1')).resolves.toEqual({ ok: true });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LeaveServer', result: 'success' }),
    );
    expect(realtimePublisher.publishToRoom).toHaveBeenCalledWith(
      `server:${serverId()}`,
      RealtimeEvent.MemberChanged,
      expect.objectContaining({ change_type: 'left' }),
      'request-1',
    );
  });

  function mockServerDetailQueries(currentUserId: string) {
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        ...serverRow(),
        ...memberRow({ userId: currentUserId }),
      },
    ]);
    prisma.$queryRaw.mockResolvedValueOnce([channelRow()]);
    prisma.$queryRaw.mockResolvedValueOnce([memberRow({ userId: currentUserId })]);
    prisma.$queryRaw.mockResolvedValueOnce([roleRow()]);
    prisma.$queryRaw.mockResolvedValueOnce([]);
  }
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
