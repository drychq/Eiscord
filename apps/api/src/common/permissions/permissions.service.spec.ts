import { ErrorCode, PermissionBit } from '@eiscord/shared';

import { AppError } from '../errors/app-error';
import { PrismaService } from '../persistence/prisma.service';
import { AuditService } from '../../modules/audit/audit.service';
import { PermissionAction } from './permission.types';
import { PermissionsService } from './permissions.service';

const user = {
  accountStatus: 'active' as const,
  sessionId: 'session-1',
  userId: userId(1),
};

describe('PermissionsService', () => {
  let auditService: jest.Mocked<AuditService>;
  let prisma: { $queryRaw: jest.Mock };
  let service: PermissionsService;

  beforeEach(() => {
    auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    prisma = {
      $queryRaw: jest.fn(),
    };
    service = new PermissionsService(auditService, prisma as unknown as PrismaService);
  });

  it('allows direct conversation participants to subscribe', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ allowed: 1 }]);

    await expect(
      service.assertAllowed({
        action: PermissionAction.SubscribeRealtime,
        resource: { id: resourceId(), type: 'dm' },
        user,
      }),
    ).resolves.toBeUndefined();
  });

  it('denies non-participants from direct conversations', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await expect(
      service.assertAllowed({
        action: PermissionAction.SubscribeRealtime,
        requestId: 'request-1',
        resource: { id: resourceId(), type: 'dm' },
        user,
      }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.PermissionDenied });

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: `PermissionDenied:${PermissionAction.SubscribeRealtime}`,
        failureReason: 'not_dm_participant',
      }),
    );
  });

  it('allows active server members to subscribe to server rooms', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([serverContextRow()]);

    await expect(
      service.assertAllowed({
        action: PermissionAction.SubscribeRealtime,
        resource: { id: serverId(), type: 'server' },
        user,
      }),
    ).resolves.toBeUndefined();
  });

  it('allows owners to manage channels without role bits', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([serverContextRow({ ownerId: user.userId, permissionBits: '0' })]);

    await expect(
      service.assertAllowed({
        action: PermissionAction.ManageChannel,
        resource: { id: serverId(), type: 'server' },
        user,
      }),
    ).resolves.toBeUndefined();
  });

  it('applies channel role and member overwrites with member allow overriding role deny', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ channelId: channelId(), serverId: serverId(), type: 'text' }]);
    prisma.$queryRaw.mockResolvedValueOnce([
      serverContextRow({
        permissionBits: String(PermissionBit.ViewChannel),
        roleIds: [roleId()],
      }),
    ]);
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        allowBits: '0',
        denyBits: String(PermissionBit.SendMessage),
        targetId: roleId(),
        targetType: 'role',
      },
      {
        allowBits: String(PermissionBit.SendMessage),
        denyBits: '0',
        targetId: membershipId(),
        targetType: 'member',
      },
    ]);

    await expect(
      service.assertAllowed({
        action: PermissionAction.SendMessage,
        resource: { id: channelId(), type: 'channel' },
        user,
      }),
    ).resolves.toBeUndefined();
  });

  it('denies muted members from sending messages', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ channelId: channelId(), serverId: serverId(), type: 'text' }]);
    prisma.$queryRaw.mockResolvedValueOnce([
      serverContextRow({
        memberStatus: 'muted',
        permissionBits: String(PermissionBit.ViewChannel | PermissionBit.SendMessage),
      }),
    ]);
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await expect(
      service.assertAllowed({
        action: PermissionAction.SendMessage,
        resource: { id: channelId(), type: 'channel' },
        user,
      }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.PermissionDenied });
  });

  it('denies non-members from server rooms', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([serverContextRow({ memberStatus: null, membershipId: null })]);

    await expect(
      service.assertAllowed({
        action: PermissionAction.SubscribeRealtime,
        resource: { id: serverId(), type: 'server' },
        user,
      }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.PermissionDenied });
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

function resourceId(): string {
  return '00000000-0000-4000-8000-000000000501';
}

function serverContextRow(overrides: Record<string, unknown> = {}) {
  return {
    highestPriority: 0,
    memberStatus: 'active',
    membershipId: membershipId(),
    ownerId: userId(9),
    permissionBits: String(PermissionBit.ViewChannel | PermissionBit.SendMessage),
    roleIds: [roleId()],
    serverId: serverId(),
    ...overrides,
  };
}
