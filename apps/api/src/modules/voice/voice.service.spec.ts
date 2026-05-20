import { ConfigService } from '@nestjs/config';

import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { PrismaService } from '../../common/persistence/prisma.service';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { MediaSignalingService } from '../media-signaling/media-signaling.service';
import { TurnCredentialService } from '../media-signaling/turn-credential.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { VoiceService } from './voice.service';

const now = new Date('2026-05-04T00:00:00.000Z');
const user = { accountStatus: 'active' as const, sessionId: sessionId(), userId: userId(1) };

describe('VoiceService', () => {
  let auditService: jest.Mocked<AuditService>;
  let configService: { get: jest.Mock };
  let mediaSignalingService: jest.Mocked<MediaSignalingService>;
  let permissionsService: jest.Mocked<PermissionsService>;
  let prisma: { $executeRaw: jest.Mock; $queryRaw: jest.Mock; $transaction: jest.Mock };
  let realtimePublisher: jest.Mocked<RealtimePublisher>;
  let service: VoiceService;
  let tx: { $executeRaw: jest.Mock; $queryRaw: jest.Mock };
  let turnCredentialService: jest.Mocked<TurnCredentialService>;

  beforeEach(() => {
    auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'VOICE_NEGOTIATION_TIMEOUT_MS') return 30_000;
        if (key === 'VOICE_NEGOTIATION_SWEEP_INTERVAL_MS') return 5_000;
        return undefined;
      }),
    };
    mediaSignalingService = {
      pauseProducer: jest.fn().mockResolvedValue(undefined),
      prepareRouter: jest.fn().mockResolvedValue({ routerId: 'router-1', rtpCapabilities: { codecs: [] } }),
      releaseSession: jest.fn().mockResolvedValue(undefined),
      resumeProducer: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MediaSignalingService>;
    permissionsService = {
      assertAllowed: jest.fn().mockResolvedValue(undefined),
      checkAllowed: jest.fn().mockResolvedValue({ allowed: true }),
    } as unknown as jest.Mocked<PermissionsService>;
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
      leaveUserRooms: jest.fn(),
      publishToRoom: jest.fn(),
    } as unknown as jest.Mocked<RealtimePublisher>;
    turnCredentialService = {
      signCredential: jest.fn().mockReturnValue({
        credential: 'credential',
        credential_type: 'password',
        ttl_seconds: 300,
        urls: ['turn:localhost:3478?transport=udp'],
        username: '1714915200:user',
      }),
    } as unknown as jest.Mocked<TurnCredentialService>;
    service = new VoiceService(
      auditService,
      configService as unknown as ConfigService,
      mediaSignalingService,
      permissionsService,
      prisma as unknown as PrismaService,
      realtimePublisher,
      turnCredentialService,
    );
  });

  it('joins a voice channel with mediasoup negotiation metadata and TURN credentials', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ channelId: channelId(2), serverId: serverId() }]);
    prisma.$queryRaw.mockResolvedValueOnce([{ count: '1' }]);
    tx.$queryRaw.mockResolvedValueOnce([]);
    tx.$queryRaw.mockResolvedValueOnce([
      voiceSessionRow({ channelId: channelId(2), id: sessionId(2), mediaState: 'negotiating' }),
    ]);
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        channelId: channelId(2),
        muteState: false,
        producerId: 'producer-existing',
        userId: userId(2),
      },
    ]);

    const result = await service.joinChannel(
      user,
      channelId(2),
      { initial_deafen_state: false, initial_mute_state: false },
      'request-1',
    );

    expect(result).toMatchObject({
      channel_id: channelId(2),
      media: {
        active_producers: [
          {
            channel_id: channelId(2),
            kind: 'audio',
            paused: false,
            producer_id: 'producer-existing',
            user_id: userId(2),
          },
        ],
        ice_servers: [{ credential: 'credential', credential_type: 'password' }],
        router_rtp_capabilities: { codecs: [] },
        signaling_channel: `voice:${channelId(2)}`,
      },
      media_state: 'negotiating',
      session_id: sessionId(2),
    });
    expect(mediaSignalingService.prepareRouter).toHaveBeenCalledWith(channelId(2));
    expect(tx.$queryRaw.mock.calls[1][0].join('')).toContain('router_id');
    expect(tx.$queryRaw.mock.calls[1]).toContain('router-1');
    expect(turnCredentialService.signCredential).toHaveBeenCalledWith(user.userId);
    expect(realtimePublisher.publishToRoom).toHaveBeenCalledWith(
      `voice:${channelId(2)}`,
      RealtimeEvent.VoiceMemberJoined,
      expect.objectContaining({ session_id: sessionId(2) }),
      'request-1',
    );
  });

  it('does not create or end a voice session when media router preparation fails', async () => {
    const logger = (service as unknown as { logger: { warn: (message: string) => void } }).logger;
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    prisma.$queryRaw.mockResolvedValueOnce([{ channelId: channelId(2), serverId: serverId() }]);
    prisma.$queryRaw.mockResolvedValueOnce([{ count: '0' }]);
    mediaSignalingService.prepareRouter.mockRejectedValueOnce(new Error('mediasoup worker exited.'));

    await expect(service.joinChannel(user, channelId(2), {}, 'request-media-down')).rejects.toMatchObject({
      code: ErrorCode.DependencyUnavailable,
      message: 'Voice media service is unavailable.',
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mediaSignalingService.releaseSession).not.toHaveBeenCalled();
    expect(realtimePublisher.publishToRoom).not.toHaveBeenCalled();
    expect(auditService.record).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Failed to prepare voice router'));
  });

  it('switches to a new voice channel and releases the previous mediasoup session', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ channelId: channelId(2), serverId: serverId() }]);
    prisma.$queryRaw.mockResolvedValueOnce([{ count: '0' }]);
    tx.$queryRaw.mockResolvedValueOnce([voiceSessionRow({ channelId: channelId(1), id: sessionId(1) })]);
    tx.$queryRaw.mockResolvedValueOnce([
      voiceSessionRow({ channelId: channelId(2), id: sessionId(2), mediaState: 'negotiating' }),
    ]);
    prisma.$queryRaw.mockResolvedValueOnce([]);

    await service.joinChannel(user, channelId(2), {}, 'request-2');

    expect(mediaSignalingService.releaseSession).toHaveBeenCalledWith(sessionId(1), 'switch_channel');
    expect(realtimePublisher.publishToRoom).toHaveBeenCalledWith(
      `voice:${channelId(1)}`,
      RealtimeEvent.VoiceMemberLeft,
      expect.objectContaining({ reason: 'switch_channel', user_id: userId(1) }),
      'request-2',
    );
  });

  it('rejects joining when the voice channel reaches its participant limit', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ channelId: channelId(2), serverId: serverId() }]);
    prisma.$queryRaw.mockResolvedValueOnce([{ count: '20' }]);

    await expect(service.joinChannel(user, channelId(2), {}, 'request-full')).rejects.toThrow(
      'Voice channel is full.',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('toggles producer pause when mute state flips', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([voiceSessionRow({ muteState: false, producerId: 'producer-1' })]);
    prisma.$queryRaw.mockResolvedValueOnce([
      voiceSessionRow({ muteState: true, producerId: 'producer-1' }),
    ]);

    await service.updateState(user, sessionId(1), { mute_state: true }, 'request-3');

    expect(mediaSignalingService.pauseProducer).toHaveBeenCalledWith('producer-1');
    expect(realtimePublisher.publishToRoom).toHaveBeenCalledWith(
      `voice:${channelId(1)}`,
      RealtimeEvent.VoiceStateChanged,
      expect.objectContaining({ mute_state: true, session_id: sessionId(1) }),
      'request-3',
    );
  });

  it('releases the mediasoup session when leaving manually', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([voiceSessionRow({})]);

    await service.leaveSession(user, sessionId(1), 'request-4');

    expect(mediaSignalingService.releaseSession).toHaveBeenCalledWith(sessionId(1), 'manual_leave');
  });

  it('sweeps expired negotiations and broadcasts signaling timeout', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([voiceSessionRow({ id: sessionId(9), mediaState: 'negotiating' })]);

    await service.sweepNegotiationTimeouts();

    expect(mediaSignalingService.releaseSession).toHaveBeenCalledWith(sessionId(9), 'signaling_timeout');
    expect(realtimePublisher.publishToRoom).toHaveBeenCalledWith(
      `voice:${channelId(1)}`,
      RealtimeEvent.VoiceMemberLeft,
      expect.objectContaining({ reason: 'signaling_timeout' }),
      undefined,
    );
  });

  it('refreshes ICE servers for the session owner', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([voiceSessionRow({})]);

    const result = await service.refreshIceServers(user, sessionId(1));

    expect(result.ice_servers).toHaveLength(1);
    expect(turnCredentialService.signCredential).toHaveBeenCalledWith(user.userId);
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
    mediaState: 'negotiating',
    muteState: false,
    producerId: null,
    recvTransportId: null,
    routerId: null,
    sendTransportId: null,
    updatedAt: now,
    userId: userId(1),
    userNickname: 'Alice',
    username: 'alice',
    ...overrides,
  };
}
