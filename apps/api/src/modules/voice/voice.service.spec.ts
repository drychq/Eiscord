import { RealtimeEvent } from '@eiscord/shared';

import { PrismaService } from '../../common/persistence/prisma.service';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { VoiceService } from './voice.service';

const now = new Date('2026-05-04T00:00:00.000Z');
const user = { accountStatus: 'active' as const, sessionId: sessionId(), userId: userId(1) };

describe('VoiceService', () => {
  let auditService: jest.Mocked<AuditService>;
  let permissionsService: jest.Mocked<PermissionsService>;
  let prisma: { $queryRaw: jest.Mock; $transaction: jest.Mock };
  let realtimePublisher: jest.Mocked<RealtimePublisher>;
  let service: VoiceService;
  let tx: { $executeRaw: jest.Mock; $queryRaw: jest.Mock };

  beforeEach(() => {
    auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    permissionsService = {
      assertAllowed: jest.fn().mockResolvedValue(undefined),
      checkAllowed: jest.fn().mockResolvedValue({ allowed: true }),
    } as unknown as jest.Mocked<PermissionsService>;
    tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn(),
    };
    prisma = {
      $queryRaw: jest.fn(),
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    realtimePublisher = {
      leaveUserRooms: jest.fn(),
      publishToRoom: jest.fn(),
    } as unknown as jest.Mocked<RealtimePublisher>;
    service = new VoiceService(
      auditService,
      permissionsService,
      prisma as unknown as PrismaService,
      realtimePublisher,
    );
  });

  it('automatically switches an existing voice session before joining the new channel', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ channelId: channelId(2), serverId: serverId() }]);
    tx.$queryRaw.mockResolvedValueOnce([voiceSessionRow({ channelId: channelId(1), id: sessionId(1) })]);
    tx.$queryRaw.mockResolvedValueOnce([
      voiceSessionRow({ channelId: channelId(2), id: sessionId(2), muteState: true }),
    ]);

    await expect(
      service.joinChannel(
        user,
        channelId(2),
        { initial_deafen_state: false, initial_mute_state: true },
        'request-1',
      ),
    ).resolves.toMatchObject({
      channel_id: channelId(2),
      mute_state: true,
      session_id: sessionId(2),
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(realtimePublisher.publishToRoom).toHaveBeenCalledWith(
      `voice:${channelId(1)}`,
      RealtimeEvent.VoiceMemberLeft,
      expect.objectContaining({ reason: 'switch_channel', user_id: userId(1) }),
      'request-1',
    );
    expect(realtimePublisher.publishToRoom).toHaveBeenCalledWith(
      `voice:${channelId(2)}`,
      RealtimeEvent.VoiceMemberJoined,
      expect.objectContaining({ session_id: sessionId(2) }),
      'request-1',
    );
  });

  it('updates voice state and publishes VoiceStateChanged', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([voiceSessionRow({ muteState: false })]);
    prisma.$queryRaw.mockResolvedValueOnce([voiceSessionRow({ muteState: true })]);

    await expect(
      service.updateState(user, sessionId(1), { mute_state: true }, 'request-2'),
    ).resolves.toMatchObject({ mute_state: true });

    expect(realtimePublisher.publishToRoom).toHaveBeenCalledWith(
      `voice:${channelId(1)}`,
      RealtimeEvent.VoiceStateChanged,
      expect.objectContaining({ mute_state: true, session_id: sessionId(1) }),
      'request-2',
    );
  });

  it('leaves missing sessions idempotently', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await expect(service.leaveSession(user, sessionId(1))).resolves.toEqual({ ok: true });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});

function userId(index: number): string {
  return `00000000-0000-4000-8000-00000000000${index}`;
}

function serverId(): string {
  return '00000000-0000-4000-8000-000000000101';
}

function channelId(index: number): string {
  return `00000000-0000-4000-8000-00000000020${index}`;
}

function sessionId(index = 1): string {
  return `00000000-0000-4000-8000-00000000030${index}`;
}

function voiceSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    avatarAttachmentId: null,
    channelId: channelId(1),
    connectionStatus: 'connected',
    deafenState: false,
    id: sessionId(1),
    joinedAt: now,
    muteState: false,
    updatedAt: now,
    userId: userId(1),
    userNickname: 'Alice',
    username: 'alice',
    ...overrides,
  };
}
