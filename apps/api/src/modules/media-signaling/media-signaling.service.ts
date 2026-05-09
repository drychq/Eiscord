import { HttpStatus, Injectable } from '@nestjs/common';

import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import type { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { PermissionAction } from '../../common/permissions/permission.types';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { buildRealtimeRoom } from '../realtime/realtime.rooms';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { MediasoupRouterRegistry } from './mediasoup-router.registry';
import { MediasoupWorkerClient } from './mediasoup-worker.client';
import { TurnCredentialService } from './turn-credential.service';

export type VoiceMediaSessionRow = {
  channelId: string;
  id: string;
  mediaState: string;
  producerId: string | null;
  recvTransportId: string | null;
  routerId: string | null;
  sendTransportId: string | null;
  userId: string;
};

export type PreparedRouter = {
  routerId: string;
  rtpCapabilities: Record<string, unknown>;
};

export type CreateTransportResult = {
  dtls_parameters: Record<string, unknown>;
  ice_candidates: Record<string, unknown>[];
  ice_parameters: Record<string, unknown>;
  ice_servers: ReturnType<TurnCredentialService['signCredential']>[];
  transport_id: string;
};

@Injectable()
export class MediaSignalingService {
  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly prisma: PrismaService,
    private readonly publisher: RealtimePublisher,
    private readonly routerRegistry: MediasoupRouterRegistry,
    private readonly turnCredentialService: TurnCredentialService,
    private readonly workerClient: MediasoupWorkerClient,
  ) {}

  async prepareRouter(channelId: string): Promise<PreparedRouter> {
    const router = await this.routerRegistry.getOrCreateRouter(channelId);

    return {
      routerId: router.routerId,
      rtpCapabilities: router.rtpCapabilities,
    };
  }

  async getActiveSessionForUser(sessionId: string, user: AuthenticatedUserContext): Promise<VoiceMediaSessionRow> {
    const session = await this.getActiveSession(sessionId);

    if (session.userId !== user.userId) {
      throw new AppError(ErrorCode.PermissionDenied, 'Cannot signal another user voice session.', HttpStatus.FORBIDDEN);
    }

    return session;
  }

  async createTransport(
    user: AuthenticatedUserContext,
    session: VoiceMediaSessionRow,
    direction: 'send' | 'recv',
  ): Promise<CreateTransportResult> {
    await this.permissionsService.assertAllowed({
      action: PermissionAction.JoinVoice,
      resource: { id: session.channelId, type: 'voice' },
      user,
    });

    const router = session.routerId
      ? { routerId: session.routerId, rtpCapabilities: {} }
      : await this.prepareRouter(session.channelId);
    const result = await this.workerClient.request<{
      dtlsParameters: Record<string, unknown>;
      iceCandidates: Record<string, unknown>[];
      iceParameters: Record<string, unknown>;
      transportId: string;
    }>('createWebRtcTransport', {
      channelId: session.channelId,
      direction,
      routerId: router.routerId,
    });

    await this.prisma.$executeRaw`
      UPDATE voice_sessions
      SET
        router_id = ${router.routerId},
        send_transport_id = CASE WHEN ${direction} = 'send' THEN ${result.transportId} ELSE send_transport_id END,
        recv_transport_id = CASE WHEN ${direction} = 'recv' THEN ${result.transportId} ELSE recv_transport_id END,
        updated_at = NOW()
      WHERE id = ${session.id}::uuid
        AND ended_at IS NULL
    `;

    return {
      dtls_parameters: result.dtlsParameters,
      ice_candidates: result.iceCandidates,
      ice_parameters: result.iceParameters,
      ice_servers: [this.turnCredentialService.signCredential(user.userId)],
      transport_id: result.transportId,
    };
  }

  async connectSessionTransport(
    user: AuthenticatedUserContext,
    session: VoiceMediaSessionRow,
    transportId: string,
    dtlsParameters: Record<string, unknown>,
  ) {
    await this.permissionsService.assertAllowed({
      action: PermissionAction.JoinVoice,
      resource: { id: session.channelId, type: 'voice' },
      user,
    });
    this.assertTransportBelongsToSession(session, transportId);

    await this.workerClient.request('connectTransport', { dtlsParameters, transportId });

    return { ok: true };
  }

  async produce(
    user: AuthenticatedUserContext,
    session: VoiceMediaSessionRow,
    transportId: string,
    kind: string,
    rtpParameters: Record<string, unknown>,
  ) {
    if (kind !== 'audio') {
      throw new AppError(ErrorCode.ValidationFailed, 'Only audio producers are allowed.', HttpStatus.BAD_REQUEST);
    }

    await this.permissionsService.assertAllowed({
      action: PermissionAction.SpeakVoice,
      resource: { id: session.channelId, type: 'voice' },
      user,
    });
    this.assertSendTransportBelongsToSession(session, transportId);

    const result = await this.workerClient.request<{ producerId: string }>('produce', {
      rtpParameters,
      transportId,
      userId: user.userId,
    });

    await this.prisma.$executeRaw`
      UPDATE voice_sessions
      SET
        connection_status = 'connected',
        media_state = 'connected',
        negotiation_deadline = NULL,
        producer_id = ${result.producerId},
        updated_at = NOW()
      WHERE id = ${session.id}::uuid
        AND ended_at IS NULL
    `;

    this.publisher.publishToRoom(
      buildRealtimeRoom('voice', session.channelId),
      RealtimeEvent.VoiceProducerCreated,
      {
        channel_id: session.channelId,
        created_at: new Date().toISOString(),
        kind: 'audio',
        paused: false,
        producer_id: result.producerId,
        user_id: user.userId,
      },
    );
    this.publisher.publishToRoom(
      buildRealtimeRoom('voice', session.channelId),
      RealtimeEvent.VoiceStateChanged,
      {
        channel_id: session.channelId,
        connection_status: 'connected',
        media_state: 'connected',
        session_id: session.id,
        updated_at: new Date().toISOString(),
        user_id: user.userId,
      },
    );

    return { producer_id: result.producerId };
  }

  async consume(
    user: AuthenticatedUserContext,
    session: VoiceMediaSessionRow,
    producerId: string,
    rtpCapabilities: Record<string, unknown>,
  ) {
    await this.permissionsService.assertAllowed({
      action: PermissionAction.ListenVoice,
      resource: { id: session.channelId, type: 'voice' },
      user,
    });

    const transportId = session.recvTransportId;

    if (!transportId) {
      throw new AppError(ErrorCode.Conflict, 'Receive transport has not been created.', HttpStatus.CONFLICT);
    }

    const result = await this.workerClient.request<{
      consumerId: string;
      kind: 'audio';
      producerPaused: boolean;
      rtpParameters: Record<string, unknown>;
    }>('consume', {
      producerId,
      rtpCapabilities,
      transportId,
    });

    return {
      consumer_id: result.consumerId,
      kind: result.kind,
      producer_paused: result.producerPaused,
      rtp_parameters: result.rtpParameters,
    };
  }

  async resumeConsumer(user: AuthenticatedUserContext, session: VoiceMediaSessionRow, consumerId: string) {
    await this.permissionsService.assertAllowed({
      action: PermissionAction.ListenVoice,
      resource: { id: session.channelId, type: 'voice' },
      user,
    });

    const transportId = session.recvTransportId;

    if (!transportId) {
      throw new AppError(ErrorCode.Conflict, 'Receive transport has not been created.', HttpStatus.CONFLICT);
    }

    await this.workerClient.request('resumeConsumer', { consumerId, transportId });

    return { ok: true };
  }

  async pauseProducer(producerId: string | null) {
    if (producerId) {
      await this.workerClient.request('pauseProducer', { producerId });
    }
  }

  async resumeProducer(producerId: string | null) {
    if (producerId) {
      await this.workerClient.request('resumeProducer', { producerId });
    }
  }

  async releaseSession(sessionId: string, reason: string) {
    const session = await this.getActiveOrEndedSession(sessionId);

    if (!session) {
      return;
    }

    await this.workerClient.request('releaseSession', {
      producerId: session.producerId ?? undefined,
      transportIds: [session.sendTransportId, session.recvTransportId].filter(Boolean),
    }).catch(() => undefined);

    if (session.producerId) {
      this.publisher.publishToRoom(
        buildRealtimeRoom('voice', session.channelId),
        RealtimeEvent.VoiceProducerClosed,
        {
          channel_id: session.channelId,
          closed_at: new Date().toISOString(),
          producer_id: session.producerId,
          reason,
          user_id: session.userId,
        },
      );
    }
  }

  async getActiveSession(sessionId: string): Promise<VoiceMediaSessionRow> {
    const [session] = await this.prisma.$queryRaw<VoiceMediaSessionRow[]>`
      SELECT
        id,
        channel_id AS "channelId",
        user_id AS "userId",
        media_state AS "mediaState",
        router_id AS "routerId",
        send_transport_id AS "sendTransportId",
        recv_transport_id AS "recvTransportId",
        producer_id AS "producerId"
      FROM voice_sessions
      WHERE id = ${sessionId}::uuid
        AND ended_at IS NULL
      LIMIT 1
    `;

    if (!session) {
      throw new AppError(ErrorCode.ResourceNotFound, 'Voice session was not found.', HttpStatus.NOT_FOUND);
    }

    return session;
  }

  private async getActiveOrEndedSession(sessionId: string): Promise<VoiceMediaSessionRow | null> {
    const [session] = await this.prisma.$queryRaw<VoiceMediaSessionRow[]>`
      SELECT
        id,
        channel_id AS "channelId",
        user_id AS "userId",
        media_state AS "mediaState",
        router_id AS "routerId",
        send_transport_id AS "sendTransportId",
        recv_transport_id AS "recvTransportId",
        producer_id AS "producerId"
      FROM voice_sessions
      WHERE id = ${sessionId}::uuid
      LIMIT 1
    `;

    return session ?? null;
  }

  private assertTransportBelongsToSession(session: VoiceMediaSessionRow, transportId: string) {
    if (session.sendTransportId === transportId || session.recvTransportId === transportId) {
      return;
    }

    throw new AppError(
      ErrorCode.PermissionDenied,
      'Cannot use a transport outside the active voice session.',
      HttpStatus.FORBIDDEN,
    );
  }

  private assertSendTransportBelongsToSession(session: VoiceMediaSessionRow, transportId: string) {
    if (!session.sendTransportId) {
      throw new AppError(ErrorCode.Conflict, 'Send transport has not been created.', HttpStatus.CONFLICT);
    }

    if (session.sendTransportId !== transportId) {
      throw new AppError(
        ErrorCode.PermissionDenied,
        'Cannot produce on a transport outside the active voice session.',
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
