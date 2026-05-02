import { ErrorCode } from '@eiscord/shared';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { UserRecord } from './user.presenter';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let auditService: jest.Mocked<AuditService>;
  let prisma: { $queryRaw: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    prisma = {
      $queryRaw: jest.fn(),
    };
    service = new UsersService(auditService, prisma as unknown as PrismaService);
  });

  it('returns the current user profile', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([userRecord({ nickname: 'Alice' })]);

    await expect(
      service.getCurrentUser({ accountStatus: 'active', sessionId: 'session-1', userId: 'user-1' }),
    ).resolves.toMatchObject({
      nickname: 'Alice',
      user_id: 'user-1',
    });
  });

  it('updates nickname, bio, and clears avatar references', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      userRecord({ avatarAttachmentId: '00000000-0000-4000-8000-000000000001' }),
    ]);
    prisma.$queryRaw.mockResolvedValueOnce([
      userRecord({ avatarAttachmentId: null, bio: 'hello', nickname: 'Alice New' }),
    ]);

    const result = await service.updateProfile(
      { accountStatus: 'active', sessionId: 'session-1', userId: 'user-1' },
      {
        avatar_attachment_id: null,
        bio: ' hello ',
        nickname: ' Alice New ',
      },
      'request-1',
    );

    expect(result).toMatchObject({
      avatar_attachment_id: null,
      bio: 'hello',
      nickname: 'Alice New',
    });
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UpdateProfile', result: 'success' }),
    );
  });

  it('rejects avatar attachments that are not owned ready avatar files', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([userRecord({})]);
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await expect(
      service.updateProfile(
        { accountStatus: 'active', sessionId: 'session-1', userId: 'user-1' },
        { avatar_attachment_id: '00000000-0000-4000-8000-000000000002' },
      ),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.ResourceNotFound });

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UpdateProfile', result: 'failure' }),
    );
  });
});

function userRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    accountStatus: 'active',
    avatarAttachmentId: null,
    bio: null,
    createdAt: new Date('2026-05-02T00:00:00.000Z'),
    emailOrPhone: 'alice@example.com',
    id: 'user-1',
    nickname: 'alice',
    passwordHash: 'hashed-password',
    presenceStatus: 'offline',
    username: 'alice',
    ...overrides,
  };
}
