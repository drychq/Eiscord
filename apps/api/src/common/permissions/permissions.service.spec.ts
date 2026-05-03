import { ErrorCode } from '@eiscord/shared';

import { AppError } from '../errors/app-error';
import { PrismaService } from '../persistence/prisma.service';
import { AuditService } from '../../modules/audit/audit.service';
import { PermissionAction } from './permission.types';
import { PermissionsService } from './permissions.service';

const user = {
  accountStatus: 'active' as const,
  sessionId: 'session-1',
  userId: '00000000-0000-4000-8000-000000000001',
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
    prisma.$queryRaw.mockResolvedValueOnce([{ allowed: 1 }]);

    await expect(
      service.assertAllowed({
        action: PermissionAction.SubscribeRealtime,
        resource: { id: resourceId(), type: 'server' },
        user,
      }),
    ).resolves.toBeUndefined();
  });

  it('allows members to subscribe to active channels in their servers', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ allowed: 1 }]);

    await expect(
      service.assertAllowed({
        action: PermissionAction.SubscribeRealtime,
        resource: { id: resourceId(), type: 'channel' },
        user,
      }),
    ).resolves.toBeUndefined();
  });

  it('denies non-members from server rooms', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await expect(
      service.assertAllowed({
        action: PermissionAction.SubscribeRealtime,
        resource: { id: resourceId(), type: 'server' },
        user,
      }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.PermissionDenied });
  });
});

function resourceId(): string {
  return '00000000-0000-4000-8000-000000000101';
}
