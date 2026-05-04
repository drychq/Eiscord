import { RealtimeEvent } from '@eiscord/shared';

import { PrismaService } from '../../common/persistence/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { RealtimePublisher } from './realtime.publisher';
import { PresenceService } from './presence.service';

const now = new Date('2026-05-04T00:00:00.000Z');

describe('PresenceService', () => {
  let prisma: { $queryRaw: jest.Mock };
  let publisher: jest.Mocked<RealtimePublisher>;
  let redis: jest.Mocked<RedisService>;
  let service: PresenceService;

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn() };
    publisher = {
      publishToRoom: jest.fn(),
    } as unknown as jest.Mocked<RealtimePublisher>;
    redis = {
      execute: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<RedisService>;
    service = new PresenceService(
      prisma as unknown as PrismaService,
      publisher,
      redis,
    );
  });

  it('publishes invisible as offline to visible recipients while preserving self status', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([presenceRow({ presenceStatus: 'invisible' })]);
    prisma.$queryRaw.mockResolvedValueOnce([{ userId: userId(2) }]);

    await expect(
      service.updatePresence(
        { accountStatus: 'active', sessionId: sessionId(), userId: userId(1) },
        'invisible',
        'request-1',
      ),
    ).resolves.toMatchObject({ presence_status: 'invisible' });

    expect(publisher.publishToRoom).toHaveBeenCalledWith(
      `user:${userId(1)}`,
      RealtimeEvent.PresenceChanged,
      expect.objectContaining({ visible_status: 'invisible' }),
      'request-1',
    );
    expect(publisher.publishToRoom).toHaveBeenCalledWith(
      `user:${userId(2)}`,
      RealtimeEvent.PresenceChanged,
      expect.objectContaining({ visible_status: 'offline' }),
      'request-1',
    );
  });

  it('finalizes offline users discovered by the Redis sweep', async () => {
    const redisClient = {
      del: jest.fn(),
      sadd: jest.fn(),
      scard: jest.fn().mockResolvedValue(0),
      set: jest.fn(),
      srem: jest.fn(),
      zadd: jest.fn(),
      zrangebyscore: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([userId(1)]),
      zrem: jest.fn(),
    };
    redis.execute.mockImplementation((operation) =>
      operation(redisClient as never),
    );
    prisma.$queryRaw.mockResolvedValueOnce([presenceRow({ presenceStatus: 'online' })]);
    prisma.$queryRaw.mockResolvedValueOnce([presenceRow({ presenceStatus: 'offline' })]);
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await expect(service.sweepExpiredPresence()).resolves.toEqual([userId(1)]);
    expect(publisher.publishToRoom).toHaveBeenCalledWith(
      `user:${userId(1)}`,
      RealtimeEvent.PresenceChanged,
      expect.objectContaining({ visible_status: 'offline' }),
      undefined,
    );
  });

  it('transitions from offline to online on trackConnection', async () => {
    const redisClient = {
      set: jest.fn(),
      sadd: jest.fn(),
      expire: jest.fn(),
      zadd: jest.fn(),
      zrem: jest.fn(),
    };
    redis.execute.mockImplementation((operation) =>
      operation(redisClient as never),
    );
    prisma.$queryRaw.mockResolvedValueOnce([presenceRow({ presenceStatus: 'offline' })]);
    prisma.$queryRaw.mockResolvedValueOnce([presenceRow({ presenceStatus: 'online' })]);
    prisma.$queryRaw.mockResolvedValueOnce([{ userId: userId(2) }]);
    prisma.$queryRaw.mockResolvedValueOnce([{ userId: userId(1) }]);

    await service.trackConnection(
      { accountStatus: 'active', sessionId: sessionId(), userId: userId(1) },
      'conn-1',
      'request-2',
    );

    expect(publisher.publishToRoom).toHaveBeenCalledWith(
      `user:${userId(1)}`,
      RealtimeEvent.PresenceChanged,
      expect.objectContaining({ visible_status: 'online' }),
      'request-2',
    );
  });

  it('updates presence to idle status', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([presenceRow({ presenceStatus: 'idle' })]);
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await expect(
      service.updatePresence(
        { accountStatus: 'active', sessionId: sessionId(), userId: userId(1) },
        'idle',
      ),
    ).resolves.toMatchObject({ presence_status: 'idle' });
  });
});

function userId(index: number): string {
  return `00000000-0000-4000-8000-00000000000${index}`;
}

function sessionId(): string {
  return '00000000-0000-4000-8000-000000000101';
}

function presenceRow(overrides: Record<string, unknown> = {}) {
  return {
    accountStatus: 'active',
    avatarAttachmentId: null,
    bio: null,
    createdAt: now,
    emailOrPhone: 'alice@example.com',
    id: userId(1),
    nickname: 'alice',
    passwordHash: 'hashed-password',
    presenceStatus: 'online',
    updatedAt: now,
    username: 'alice',
    ...overrides,
  };
}
