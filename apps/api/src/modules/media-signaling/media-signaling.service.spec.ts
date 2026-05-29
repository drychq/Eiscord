import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { PermissionAction } from '../../common/permissions/permission.types';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { MediaSignalingService } from './media-signaling.service';
import { MediasoupRouterRegistry } from './mediasoup-router.registry';
import { MediasoupWorkerClient } from './mediasoup-worker.client';
import { TurnCredentialService } from './turn-credential.service';

const user = {
  accountStatus: 'active' as const,
  sessionId: 'auth-session',
  userId: '00000000-0000-4000-8000-000000000001',
};

const session = {
  channelId: '00000000-0000-4000-8000-000000000201',
  id: '00000000-0000-4000-8000-000000000301',
  mediaState: 'NEGOTIATING',
  producerId: null,
  recvTransportId: 'recv-transport',
  routerId: 'router-id',
  sendTransportId: 'send-transport',
  userId: user.userId,
};

describe('MediaSignalingService', () => {
  let permissionsService: jest.Mocked<PermissionsService>;
  let prisma: { $executeRaw: jest.Mock; $queryRaw: jest.Mock };
  let publisher: jest.Mocked<RealtimePublisher>;
  let routerRegistry: jest.Mocked<MediasoupRouterRegistry>;
  let service: MediaSignalingService;
  let turnCredentialService: jest.Mocked<TurnCredentialService>;
  let workerClient: jest.Mocked<MediasoupWorkerClient>;

  beforeEach(() => {
    permissionsService = {
      assertAllowed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PermissionsService>;
    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn(),
    };
    publisher = {
      leaveUserRooms: jest.fn(),
      publishToRoom: jest.fn(),
    } as unknown as jest.Mocked<RealtimePublisher>;
    routerRegistry = {
      getOrCreateRouter: jest.fn().mockResolvedValue({ routerId: 'router-id', rtpCapabilities: { codecs: [] } }),
      removeRouter: jest.fn(),
    } as unknown as jest.Mocked<MediasoupRouterRegistry>;
    turnCredentialService = {
      signCredential: jest.fn().mockReturnValue({
        credential: 'credential',
        credential_type: 'password',
        ttl_seconds: 300,
        urls: ['turn:localhost:3478?transport=udp'],
        username: '1714915200:user',
      }),
    } as unknown as jest.Mocked<TurnCredentialService>;
    workerClient = {
      request: jest.fn(),
    } as unknown as jest.Mocked<MediasoupWorkerClient>;
    service = new MediaSignalingService(
      permissionsService,
      prisma as unknown as PrismaService,
      publisher,
      routerRegistry,
      turnCredentialService,
      workerClient,
    );
  });

  it('rejects non-audio producers before issuing worker calls', async () => {
    await expect(service.produce(user, session, 'send-transport', 'video', {})).rejects.toBeInstanceOf(AppError);
    expect(workerClient.request).not.toHaveBeenCalled();
  });

  it('asserts SPEAK_VOICE permission before producing audio', async () => {
    workerClient.request.mockResolvedValueOnce({ producerId: 'producer-1' });

    await service.produce(user, session, 'send-transport', 'audio', { codecs: [] });

    expect(permissionsService.assertAllowed).toHaveBeenCalledWith(
      expect.objectContaining({
        action: PermissionAction.SpeakVoice,
        resource: { id: session.channelId, type: 'voice' },
      }),
    );
    expect(workerClient.request).toHaveBeenCalledWith(
      'produce',
      expect.objectContaining({ transportId: 'send-transport', userId: user.userId }),
    );
  });

  it('rejects producing on a transport outside the active session', async () => {
    await expect(service.produce(user, session, 'foreign-transport', 'audio', { codecs: [] })).rejects.toBeInstanceOf(
      AppError,
    );

    expect(workerClient.request).not.toHaveBeenCalled();
  });

  it('connects only transports owned by the active session', async () => {
    workerClient.request.mockResolvedValueOnce({ ok: true });

    await service.connectSessionTransport(user, session, 'recv-transport', { fingerprints: [] });

    expect(permissionsService.assertAllowed).toHaveBeenCalledWith(
      expect.objectContaining({
        action: PermissionAction.JoinVoice,
        resource: { id: session.channelId, type: 'voice' },
      }),
    );
    expect(workerClient.request).toHaveBeenCalledWith(
      'connectTransport',
      expect.objectContaining({ transportId: 'recv-transport' }),
    );
  });

  it('rejects connecting a transport outside the active session', async () => {
    await expect(
      service.connectSessionTransport(user, session, 'foreign-transport', { fingerprints: [] }),
    ).rejects.toBeInstanceOf(AppError);

    expect(workerClient.request).not.toHaveBeenCalled();
  });

  it('asserts LISTEN_VOICE permission before consuming a producer', async () => {
    workerClient.request.mockResolvedValueOnce({
      consumerId: 'consumer-1',
      kind: 'audio',
      producerPaused: false,
      rtpParameters: { codecs: [] },
    });

    await service.consume(user, session, 'producer-1', { codecs: [] });

    expect(permissionsService.assertAllowed).toHaveBeenCalledWith(
      expect.objectContaining({ action: PermissionAction.ListenVoice }),
    );
    expect(workerClient.request).toHaveBeenCalledWith(
      'consume',
      expect.objectContaining({ producerId: 'producer-1', transportId: 'recv-transport' }),
    );
  });

  it('resumes consumers only on the session receive transport', async () => {
    workerClient.request.mockResolvedValueOnce({ ok: true });

    await service.resumeConsumer(user, session, 'consumer-1');

    expect(permissionsService.assertAllowed).toHaveBeenCalledWith(
      expect.objectContaining({ action: PermissionAction.ListenVoice }),
    );
    expect(workerClient.request).toHaveBeenCalledWith(
      'resumeConsumer',
      expect.objectContaining({ consumerId: 'consumer-1', transportId: 'recv-transport' }),
    );
  });

  it('issues TURN credentials when creating a transport', async () => {
    workerClient.request.mockResolvedValueOnce({
      dtlsParameters: { fingerprints: [] },
      iceCandidates: [],
      iceParameters: { usernameFragment: 'frag', password: 'pwd' },
      transportId: 'transport-id',
    });

    const result = await service.createTransport(user, session, 'send');

    expect(result.transport_id).toBe('transport-id');
    expect(result.ice_servers).toHaveLength(1);
    expect(turnCredentialService.signCredential).toHaveBeenCalledWith(user.userId);
  });

  it('releases an active session and broadcasts VoiceProducerClosed when producer was active', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ ...session, producerId: 'producer-1' }]);
    workerClient.request.mockResolvedValueOnce({ ok: true });

    await service.releaseSession(session.id, 'manual_leave');

    expect(workerClient.request).toHaveBeenCalledWith(
      'releaseSession',
      expect.objectContaining({ producerId: 'producer-1' }),
    );
    expect(publisher.publishToRoom).toHaveBeenCalledWith(
      `voice:${session.channelId}`,
      'VoiceProducerClosed',
      expect.objectContaining({ producer_id: 'producer-1', reason: 'manual_leave' }),
    );
  });
});
