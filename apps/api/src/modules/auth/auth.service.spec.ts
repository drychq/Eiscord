import { ConfigService } from '@nestjs/config';

import { ErrorCode } from '@eiscord/shared';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { UserRecord } from '../users/user.presenter';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

const now = new Date('2026-05-02T00:00:00.000Z');

describe('AuthService', () => {
  let auditService: jest.Mocked<AuditService>;
  let passwordService: PasswordService;
  let prisma: { $executeRaw: jest.Mock; $queryRaw: jest.Mock };
  let service: AuthService;
  let tokenService: TokenService;

  beforeEach(() => {
    auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    passwordService = new PasswordService();
    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn(),
    };
    tokenService = new TokenService({
      get: jest.fn((key: string) => {
        if (key === 'JWT_ACCESS_SECRET') {
          return 'test-access-secret';
        }

        if (key === 'JWT_ACCESS_TTL_SECONDS') {
          return 900;
        }

        if (key === 'JWT_REFRESH_TTL_SECONDS') {
          return 2_592_000;
        }

        return undefined;
      }),
    } as unknown as ConfigService);
    service = new AuthService(
      auditService,
      passwordService,
      prisma as unknown as PrismaService,
      tokenService,
    );
  });

  it('registers users without storing plaintext passwords', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      userRecord({ passwordHash: passwordService.hashPassword('StrongPass1') }),
    ]);

    const result = await service.register(
      {
        email_or_phone: 'ALICE@example.com',
        password: 'StrongPass1',
        username: 'Alice',
      },
      'request-1',
    );

    expect(result).toEqual({ account_status: 'active', user_id: 'user-1' });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(prisma.$queryRaw.mock.calls[0])).not.toContain('StrongPass1');
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RegisterUser', result: 'success' }),
    );
  });

  it('rejects weak passwords as validation failures', async () => {
    await expect(
      service.register({
        email_or_phone: 'alice@example.com',
        password: 'password',
        username: 'alice',
      }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.ValidationFailed });

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('maps duplicate identity writes to conflicts', async () => {
    prisma.$queryRaw.mockRejectedValueOnce({ code: 'P2010' });

    await expect(
      service.register({
        email_or_phone: 'alice@example.com',
        password: 'StrongPass1',
        username: 'alice',
      }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.Conflict });
  });

  it('logs in and returns access, refresh, user, and empty M2/M3 placeholders', async () => {
    const hash = passwordService.hashPassword('StrongPass1');
    prisma.$queryRaw.mockResolvedValueOnce([userRecord({ passwordHash: hash })]);
    prisma.$queryRaw.mockResolvedValueOnce([
      { expiresAt: futureDate(), id: 'session-1', revokedAt: null, userId: 'user-1' },
    ]);

    const result = await service.login({
      login_identifier: 'alice@example.com',
      password: 'StrongPass1',
    });

    expect(result.access_token).toEqual(expect.any(String));
    expect(result.refresh_token).toEqual(expect.any(String));
    expect(result.user.user_id).toBe('user-1');
    expect(result.friends).toEqual([]);
    expect(result.servers).toEqual([]);
    expect(result.unread).toEqual([]);
    expect(result.notifications).toEqual([]);
  });

  it('rejects wrong passwords without creating a session', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      userRecord({ passwordHash: passwordService.hashPassword('StrongPass1') }),
    ]);

    await expect(
      service.login({
        login_identifier: 'alice',
        password: 'WrongPass1',
      }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.InvalidCredentials });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LoginUser', result: 'failure' }),
    );
  });

  it('rotates refresh tokens', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        ...userRecord({}),
        sessionExpiresAt: futureDate(),
        sessionId: 'session-1',
        sessionRevokedAt: null,
        sessionUserId: 'user-1',
      },
    ]);

    const result = await service.refresh({ refresh_token: 'refresh-token-value' });

    expect(result.access_token).toEqual(expect.any(String));
    expect(result.refresh_token).not.toBe('refresh-token-value');
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects expired refresh tokens', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        ...userRecord({}),
        sessionExpiresAt: new Date('2026-01-01T00:00:00.000Z'),
        sessionId: 'session-1',
        sessionRevokedAt: null,
        sessionUserId: 'user-1',
      },
    ]);

    await expect(service.refresh({ refresh_token: 'refresh-token-value' })).rejects.toMatchObject<
      AppError
    >({ code: ErrorCode.AuthRequired });
  });

  it('revokes the current session on logout', async () => {
    await expect(
      service.logout({ accountStatus: 'active', sessionId: 'session-1', userId: 'user-1' }),
    ).resolves.toEqual({ ok: true });

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LogoutUser', result: 'success' }),
    );
  });
});

function userRecord(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    accountStatus: 'active',
    avatarAttachmentId: null,
    bio: null,
    createdAt: now,
    emailOrPhone: 'alice@example.com',
    id: 'user-1',
    nickname: 'alice',
    passwordHash: 'hashed-password',
    presenceStatus: 'offline',
    username: 'alice',
    ...overrides,
  };
}

function futureDate(): Date {
  return new Date(Date.now() + 60_000);
}
