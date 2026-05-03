import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { ChannelsService } from './channels.service';

const now = new Date('2026-05-03T00:00:00.000Z');
const user = { accountStatus: 'active', sessionId: sessionId(), userId: userId() };

describe('ChannelsService', () => {
  let auditService: jest.Mocked<AuditService>;
  let prisma: {
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let realtimePublisher: jest.Mocked<RealtimePublisher>;
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
    realtimePublisher = {
      publishToRoom: jest.fn(),
    } as unknown as jest.Mocked<RealtimePublisher>;
    service = new ChannelsService(
      auditService,
      prisma as unknown as PrismaService,
      realtimePublisher,
    );
  });

  it('creates channels for server members and publishes channel changes', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ serverId: serverId() }]);
    tx.$queryRaw.mockResolvedValueOnce([channelRow({ name: 'general' })]);

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
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
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

  it('rejects non-empty permission overwrites until M4', async () => {
    await expect(
      service.createChannel(user, serverId(), {
        name: 'private',
        permission_overwrites: [{}],
        type: 'text',
      }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.ValidationFailed });

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects non-members', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await expect(
      service.createChannel(user, serverId(), { name: 'general', type: 'text' }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.PermissionDenied });

    expect(auditService.record).toHaveBeenCalledWith(
      expect.objectContaining({ failureReason: 'not_server_member' }),
    );
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
