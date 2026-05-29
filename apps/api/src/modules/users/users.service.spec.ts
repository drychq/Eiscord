import { ErrorCode } from '@eiscord/shared';

import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../infra/persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PresenceService } from '../realtime/presence.service';
import type { UserRecord, UserSearchRow } from './user.presenter';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let auditService: jest.Mocked<AuditService>;
  let presenceService: jest.Mocked<PresenceService>;
  let prisma: { $queryRaw: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    presenceService = {
      updatePresence: jest.fn(),
    } as unknown as jest.Mocked<PresenceService>;
    prisma = {
      $queryRaw: jest.fn(),
    };
    service = new UsersService(
      auditService,
      presenceService,
      prisma as unknown as PrismaService,
    );
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

  it('updates presence through the realtime presence service', async () => {
    presenceService.updatePresence.mockResolvedValueOnce({
      account_status: 'active',
      avatar_attachment_id: null,
      bio: null,
      created_at: '2026-05-02T00:00:00.000Z',
      nickname: 'alice',
      presence_status: 'idle',
      user_id: 'user-1',
      username: 'alice',
    });

    await expect(
      service.updatePresence(
        { accountStatus: 'active', sessionId: 'session-1', userId: 'user-1' },
        { desired_status: 'idle' },
        'request-1',
      ),
    ).resolves.toMatchObject({ presence_status: 'idle' });

    expect(presenceService.updatePresence).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      'idle',
      'request-1',
    );
  });

  it('searches public active users with relationship status', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([
      userSearchRow({
        id: '00000000-0000-4000-8000-000000000002',
        nickname: 'Bob',
        relationshipStatus: 'pending_outgoing',
        username: 'bob',
      }),
    ]);

    const result = await service.searchUsers(
      { accountStatus: 'active', sessionId: 'session-1', userId: 'user-1' },
      { q: 'bo', limit: 5 },
    );

    expect(result).toEqual([
      expect.objectContaining({
        relationship_status: 'pending_outgoing',
        user: expect.objectContaining({
          nickname: 'Bob',
          user_id: '00000000-0000-4000-8000-000000000002',
          username: 'bob',
        }),
      }),
    ]);
  });

  it('does not query for too-short user searches', async () => {
    await expect(
      service.searchUsers(
        { accountStatus: 'active', sessionId: 'session-1', userId: 'user-1' },
        { q: 'a' },
      ),
    ).resolves.toEqual([]);
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

function userSearchRow(overrides: Partial<UserSearchRow> = {}): UserSearchRow {
  return {
    accountStatus: 'active',
    avatarAttachmentId: null,
    bio: null,
    createdAt: new Date('2026-05-02T00:00:00.000Z'),
    id: 'user-2',
    nickname: 'bob',
    presenceStatus: 'offline',
    relationshipStatus: 'none',
    username: 'bob',
    ...overrides,
  };
}
