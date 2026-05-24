import { HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ErrorCode, JoinVoiceMediaResponse, RealtimeEvent, VoiceActiveProducer, VoiceConnectionStatus, VoiceMediaState } from '@eiscord/shared';

import { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { PermissionAction } from '../../common/permissions/permission.types';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { MediaSignalingService } from '../media-signaling/media-signaling.service';
import { TurnCredentialService } from '../media-signaling/turn-credential.service';
import { buildRealtimeRoom } from '../realtime/realtime.rooms';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { JoinVoiceChannelDto } from './dto/join-voice-channel.dto';
import { UpdateVoiceStateDto } from './dto/update-voice-state.dto';
import {
  toVoiceSessionSummary,
  type VoiceSessionRow,
  type VoiceSessionSummary,
} from './voice.presenter';

type RawSqlExecutor = Pick<PrismaService, '$executeRaw' | '$queryRaw'>;

type VoiceChannelRow = {
  channelId: string;
  serverId: string;
};

type VoiceRoomCountRow = {
  count: bigint | number | string;
};

type VoiceActiveProducerRow = {
  channelId: string;
  muteState: boolean;
  producerId: string;
  userId: string;
};

export type JoinVoiceChannelResult = VoiceSessionSummary & {
  media: JoinVoiceMediaResponse;
};

@Injectable()
export class VoiceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VoiceService.name);
  private negotiationSweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly mediaSignalingService: MediaSignalingService,
    private readonly permissionsService: PermissionsService,
    private readonly prisma: PrismaService,
    private readonly realtimePublisher: RealtimePublisher,
    private readonly turnCredentialService: TurnCredentialService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test' && process.env.REALTIME_SWEEP_IN_TEST !== 'true') {
      return;
    }

    const intervalMs = this.configService.get<number>('VOICE_NEGOTIATION_SWEEP_INTERVAL_MS') ?? 5000;
    this.negotiationSweepTimer = setInterval(() => {
      void this.sweepNegotiationTimeouts();
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.negotiationSweepTimer) {
      clearInterval(this.negotiationSweepTimer);
      this.negotiationSweepTimer = null;
    }
  }

  async joinChannel(
    user: AuthenticatedUserContext,
    channelId: string,
    dto: JoinVoiceChannelDto,
    requestId?: string,
  ): Promise<JoinVoiceChannelResult> {
    await this.permissionsService.assertAllowed({
      action: PermissionAction.JoinVoice,
      requestId,
      resource: { id: channelId, type: 'voice' },
      user,
    });
    await this.getActiveVoiceChannel(channelId);
    await this.assertRoomCapacity(channelId, user.userId);

    const negotiationTimeoutMs = this.configService.get<number>('VOICE_NEGOTIATION_TIMEOUT_MS') ?? 30000;
    const router = await this.prepareVoiceRouter(channelId);

    const result = await this.prisma.$transaction(async (tx) => {
      const previous = await this.getActiveSessionForUserInternal(tx, user.userId);

      if (previous) {
        await this.endSession(tx, previous.id);
      }

      const [created] = await tx.$queryRaw<VoiceSessionRow[]>`
        INSERT INTO voice_sessions (
          channel_id,
          user_id,
          mute_state,
          deafen_state,
          connection_status,
          media_state,
          router_id,
          negotiation_deadline
        )
        VALUES (
          ${channelId}::uuid,
          ${user.userId}::uuid,
          ${dto.initial_mute_state ?? false},
          ${dto.initial_deafen_state ?? false},
          ${VoiceConnectionStatus.Connecting},
          ${VoiceMediaState.Negotiating},
          ${router.routerId},
          NOW() + (${negotiationTimeoutMs}::int * INTERVAL '1 millisecond')
        )
        RETURNING
          id,
          channel_id AS "channelId",
          user_id AS "userId",
          mute_state AS "muteState",
          deafen_state AS "deafenState",
          connection_status AS "connectionStatus",
          media_state AS "mediaState",
          router_id AS "routerId",
          send_transport_id AS "sendTransportId",
          recv_transport_id AS "recvTransportId",
          producer_id AS "producerId",
          joined_at AS "joinedAt",
          updated_at AS "updatedAt",
          (SELECT username FROM users WHERE id = ${user.userId}::uuid) AS "username",
          (SELECT nickname FROM users WHERE id = ${user.userId}::uuid) AS "userNickname",
          (SELECT avatar_attachment_id FROM users WHERE id = ${user.userId}::uuid) AS "avatarAttachmentId"
      `;

      return { created, previous };
    });

    if (result.previous) {
      this.publishVoiceLeft(result.previous, 'switch_channel', requestId);
      void this.mediaSignalingService.releaseSession(result.previous.id, 'switch_channel').catch((error) => {
        this.logger.warn(`Failed to release previous voice session: ${String(error)}`);
      });
    }

    const activeProducers = await this.listActiveProducersForChannel(this.prisma, channelId);

    this.publishVoiceJoined(result.created, requestId);

    await this.auditService.record({
      action: 'JoinVoiceChannel',
      actorId: user.userId,
      requestId,
      result: 'success',
      targetId: channelId,
      targetType: 'voice_channel',
    });

    return {
      ...toVoiceSessionSummary(result.created),
      media: {
        active_producers: activeProducers,
        ice_servers: [this.turnCredentialService.signCredential(user.userId)],
        router_rtp_capabilities: router.rtpCapabilities,
        signaling_channel: buildRealtimeRoom('voice', channelId),
      },
    };
  }

  private async prepareVoiceRouter(channelId: string) {
    try {
      return await this.mediaSignalingService.prepareRouter(channelId);
    } catch (error) {
      this.logger.warn(`Failed to prepare voice router for channel ${channelId}: ${String(error)}`);
      throw new AppError(
        ErrorCode.DependencyUnavailable,
        'Voice media service is unavailable.',
        HttpStatus.SERVICE_UNAVAILABLE,
        { dependency: 'media_worker' },
      );
    }
  }

  async listChannelSessions(
    user: AuthenticatedUserContext,
    channelId: string,
  ): Promise<VoiceSessionSummary[]> {
    await this.permissionsService.assertAllowed({
      action: PermissionAction.SubscribeRealtime,
      resource: { id: channelId, type: 'voice' },
      user,
    });
    await this.getActiveVoiceChannel(channelId);
    const rows = await this.listActiveSessionsForChannel(this.prisma, channelId);

    return rows.map(toVoiceSessionSummary);
  }

  async refreshIceServers(user: AuthenticatedUserContext, sessionId: string) {
    const current = await this.getActiveSessionById(this.prisma, sessionId);

    if (!current) {
      throw new AppError(ErrorCode.ResourceNotFound, 'Voice session was not found.', HttpStatus.NOT_FOUND);
    }

    if (current.userId !== user.userId) {
      throw new AppError(
        ErrorCode.PermissionDenied,
        'Cannot refresh ICE for another user voice session.',
        HttpStatus.FORBIDDEN,
      );
    }

    return {
      ice_servers: [this.turnCredentialService.signCredential(user.userId)],
    };
  }

  async leaveSession(
    user: AuthenticatedUserContext,
    sessionId: string,
    requestId?: string,
  ): Promise<{ ok: true }> {
    const current = await this.getActiveSessionById(this.prisma, sessionId);

    if (!current) {
      return { ok: true };
    }

    if (current.userId !== user.userId) {
      throw new AppError(
        ErrorCode.PermissionDenied,
        'Cannot leave another user voice session.',
        HttpStatus.FORBIDDEN,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.endSession(tx, sessionId);
    });
    await this.mediaSignalingService.releaseSession(sessionId, 'manual_leave').catch((error) => {
      this.logger.warn(`Failed to release voice session media plane: ${String(error)}`);
    });
    this.publishVoiceLeft(current, 'manual_leave', requestId);

    await this.auditService.record({
      action: 'LeaveVoiceChannel',
      actorId: user.userId,
      requestId,
      result: 'success',
      targetId: sessionId,
      targetType: 'voice_session',
    });

    return { ok: true };
  }

  async updateState(
    user: AuthenticatedUserContext,
    sessionId: string,
    dto: UpdateVoiceStateDto,
    requestId?: string,
  ): Promise<VoiceSessionSummary> {
    if (
      dto.mute_state === undefined &&
      dto.deafen_state === undefined &&
      dto.connection_status === undefined
    ) {
      throw new AppError(
        ErrorCode.ValidationFailed,
        'At least one voice state field must be provided.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const current = await this.getActiveSessionById(this.prisma, sessionId);

    if (!current) {
      throw new AppError(ErrorCode.ResourceNotFound, 'Voice session was not found.', HttpStatus.NOT_FOUND);
    }

    if (current.userId !== user.userId) {
      throw new AppError(
        ErrorCode.PermissionDenied,
        'Cannot update another user voice session.',
        HttpStatus.FORBIDDEN,
      );
    }

    const [updated] = await this.prisma.$queryRaw<VoiceSessionRow[]>`
      UPDATE voice_sessions
      SET
        mute_state = ${dto.mute_state ?? current.muteState},
        deafen_state = ${dto.deafen_state ?? current.deafenState},
        connection_status = ${dto.connection_status ?? current.connectionStatus},
        updated_at = NOW()
      WHERE id = ${sessionId}::uuid
        AND ended_at IS NULL
      RETURNING
        id,
        channel_id AS "channelId",
        user_id AS "userId",
        mute_state AS "muteState",
        deafen_state AS "deafenState",
        connection_status AS "connectionStatus",
        media_state AS "mediaState",
        router_id AS "routerId",
        send_transport_id AS "sendTransportId",
        recv_transport_id AS "recvTransportId",
        producer_id AS "producerId",
        joined_at AS "joinedAt",
        updated_at AS "updatedAt",
        (SELECT username FROM users WHERE id = voice_sessions.user_id) AS "username",
        (SELECT nickname FROM users WHERE id = voice_sessions.user_id) AS "userNickname",
        (SELECT avatar_attachment_id FROM users WHERE id = voice_sessions.user_id) AS "avatarAttachmentId"
    `;

    if (dto.mute_state !== undefined && dto.mute_state !== current.muteState) {
      const op = dto.mute_state
        ? this.mediaSignalingService.pauseProducer(updated.producerId)
        : this.mediaSignalingService.resumeProducer(updated.producerId);
      await op.catch((error) => {
        this.logger.warn(`Failed to toggle producer state: ${String(error)}`);
      });
    }

    this.publishVoiceStateChanged(updated, requestId);

    await this.auditService.record({
      action: 'UpdateVoiceState',
      actorId: user.userId,
      requestId,
      result: 'success',
      targetId: sessionId,
      targetType: 'voice_session',
    });

    return toVoiceSessionSummary(updated);
  }

  async releaseUserActiveSession(
    userId: string,
    reason: string,
    requestId?: string,
  ): Promise<VoiceSessionSummary | null> {
    const current = await this.getActiveSessionForUser(userId);

    if (!current) {
      return null;
    }

    await this.prisma.$transaction(async (tx) => {
      await this.endSession(tx, current.id);
    });
    await this.mediaSignalingService.releaseSession(current.id, reason).catch(() => undefined);
    this.publishVoiceLeft(current, reason, requestId);

    return toVoiceSessionSummary(current);
  }

  async releaseUserActiveSessionForServer(
    serverId: string,
    userId: string,
    reason: string,
    requestId?: string,
  ): Promise<VoiceSessionSummary | null> {
    const current = await this.getActiveSessionForUserInServer(this.prisma, serverId, userId);

    if (!current) {
      return null;
    }

    await this.prisma.$transaction(async (tx) => {
      await this.endSession(tx, current.id);
    });
    await this.mediaSignalingService.releaseSession(current.id, reason).catch(() => undefined);
    this.publishVoiceLeft(current, reason, requestId);

    return toVoiceSessionSummary(current);
  }

  async releaseUsersActiveSessions(
    userIds: string[],
    reason: string,
    requestId?: string,
  ): Promise<VoiceSessionSummary[]> {
    const released: VoiceSessionSummary[] = [];

    for (const userId of userIds) {
      const session = await this.releaseUserActiveSession(userId, reason, requestId);

      if (session) {
        released.push(session);
      }
    }

    return released;
  }

  async releaseUsersActiveSessionsForChannel(
    channelId: string,
    userIds: string[],
    reason: string,
    requestId?: string,
  ): Promise<VoiceSessionSummary[]> {
    if (userIds.length === 0) {
      return [];
    }

    const current = await this.listActiveSessionsForChannel(this.prisma, channelId);
    const targeted = current.filter((session) => userIds.includes(session.userId));

    if (targeted.length === 0) {
      return [];
    }

    await this.prisma.$transaction(async (tx) => {
      for (const session of targeted) {
        await this.endSession(tx, session.id);
      }
    });

    for (const session of targeted) {
      await this.mediaSignalingService.releaseSession(session.id, reason).catch(() => undefined);
      this.publishVoiceLeft(session, reason, requestId);
    }

    return targeted.map(toVoiceSessionSummary);
  }

  async releaseUsersActiveSessionsWithoutJoinPermission(
    serverId: string,
    userIds: string[],
    reason: string,
    requestId?: string,
  ): Promise<VoiceSessionSummary[]> {
    if (userIds.length === 0) {
      return [];
    }

    const activeSessions = await this.listActiveSessionsForUsersInServer(this.prisma, serverId, userIds);
    const toRelease: VoiceSessionRow[] = [];

    for (const session of activeSessions) {
      const decision = await this.permissionsService.checkAllowed({
        action: PermissionAction.JoinVoice,
        requestId,
        resource: { id: session.channelId, type: 'voice' },
        user: {
          accountStatus: 'active',
          sessionId: 'voice-permission-recheck',
          userId: session.userId,
        },
      });

      if (!decision.allowed) {
        toRelease.push(session);
      }
    }

    if (toRelease.length === 0) {
      return [];
    }

    await this.prisma.$transaction(async (tx) => {
      for (const session of toRelease) {
        await this.endSession(tx, session.id);
      }
    });

    for (const session of toRelease) {
      await this.mediaSignalingService.releaseSession(session.id, reason).catch(() => undefined);
      this.publishVoiceLeft(session, reason, requestId);
    }

    return toRelease.map(toVoiceSessionSummary);
  }

  async releaseChannelActiveSessions(
    channelId: string,
    reason: string,
    requestId?: string,
  ): Promise<VoiceSessionSummary[]> {
    const current = await this.listActiveSessionsForChannel(this.prisma, channelId);

    if (current.length === 0) {
      return [];
    }

    await this.prisma.$transaction(async (tx) => {
      for (const session of current) {
        await this.endSession(tx, session.id);
      }
    });

    for (const session of current) {
      await this.mediaSignalingService.releaseSession(session.id, reason).catch(() => undefined);
      this.publishVoiceLeft(session, reason, requestId);
    }

    return current.map(toVoiceSessionSummary);
  }

  async sweepNegotiationTimeouts(): Promise<VoiceSessionSummary[]> {
    const expired = await this.prisma.$queryRaw<VoiceSessionRow[]>`
      SELECT
        vs.id,
        vs.channel_id AS "channelId",
        vs.user_id AS "userId",
        vs.mute_state AS "muteState",
        vs.deafen_state AS "deafenState",
        vs.connection_status AS "connectionStatus",
        vs.media_state AS "mediaState",
        vs.router_id AS "routerId",
        vs.send_transport_id AS "sendTransportId",
        vs.recv_transport_id AS "recvTransportId",
        vs.producer_id AS "producerId",
        vs.joined_at AS "joinedAt",
        vs.updated_at AS "updatedAt",
        u.username,
        u.nickname AS "userNickname",
        u.avatar_attachment_id AS "avatarAttachmentId"
      FROM voice_sessions vs
      INNER JOIN users u ON u.id = vs.user_id
      WHERE vs.ended_at IS NULL
        AND vs.media_state IN (${VoiceMediaState.Negotiating}, ${VoiceMediaState.Reconnecting})
        AND vs.negotiation_deadline IS NOT NULL
        AND vs.negotiation_deadline < NOW()
      LIMIT 50
    `;

    if (expired.length === 0) {
      return [];
    }

    await this.prisma.$transaction(async (tx) => {
      for (const session of expired) {
        await this.endSession(tx, session.id);
      }
    });

    for (const session of expired) {
      await this.mediaSignalingService.releaseSession(session.id, 'signaling_timeout').catch(() => undefined);
      this.publishVoiceLeft(session, 'signaling_timeout');
    }

    return expired.map(toVoiceSessionSummary);
  }

  private async getActiveVoiceChannel(channelId: string): Promise<VoiceChannelRow> {
    const [channel] = await this.prisma.$queryRaw<VoiceChannelRow[]>`
      SELECT
        c.id AS "channelId",
        c.server_id AS "serverId"
      FROM channels c
      INNER JOIN servers s ON s.id = c.server_id
      WHERE c.id = ${channelId}::uuid
        AND c.type = 'voice'
        AND c.status = 'active'
        AND s.status = 'active'
      LIMIT 1
    `;

    if (!channel) {
      throw new AppError(ErrorCode.ResourceNotFound, 'Voice channel was not found.', HttpStatus.NOT_FOUND);
    }

    return channel;
  }

  private async assertRoomCapacity(channelId: string, userId: string): Promise<void> {
    const [row] = await this.prisma.$queryRaw<VoiceRoomCountRow[]>`
      SELECT COUNT(*)::text AS "count"
      FROM voice_sessions
      WHERE channel_id = ${channelId}::uuid
        AND user_id <> ${userId}::uuid
        AND ended_at IS NULL
    `;
    const activeCount = Number(row?.count ?? 0);
    const maxParticipants = this.configService.get<number>('VOICE_MAX_PARTICIPANTS_PER_ROOM') ?? 20;

    if (Number.isFinite(activeCount) && activeCount >= maxParticipants) {
      throw new AppError(ErrorCode.Conflict, 'Voice channel is full.', HttpStatus.CONFLICT);
    }
  }

  private async getActiveSessionById(
    tx: Pick<PrismaService, '$queryRaw'>,
    sessionId: string,
  ): Promise<VoiceSessionRow | null> {
    const [row] = await tx.$queryRaw<VoiceSessionRow[]>`
      SELECT
        vs.id,
        vs.channel_id AS "channelId",
        vs.user_id AS "userId",
        vs.mute_state AS "muteState",
        vs.deafen_state AS "deafenState",
        vs.connection_status AS "connectionStatus",
        vs.media_state AS "mediaState",
        vs.router_id AS "routerId",
        vs.send_transport_id AS "sendTransportId",
        vs.recv_transport_id AS "recvTransportId",
        vs.producer_id AS "producerId",
        vs.joined_at AS "joinedAt",
        vs.updated_at AS "updatedAt",
        u.username,
        u.nickname AS "userNickname",
        u.avatar_attachment_id AS "avatarAttachmentId"
      FROM voice_sessions vs
      INNER JOIN users u ON u.id = vs.user_id
      INNER JOIN channels c ON c.id = vs.channel_id
      WHERE vs.id = ${sessionId}::uuid
        AND vs.ended_at IS NULL
        AND c.status = 'active'
      LIMIT 1
    `;

    return row ?? null;
  }

  async getActiveSessionForUser(userId: string): Promise<VoiceSessionRow | null> {
    return this.getActiveSessionForUserInternal(this.prisma, userId);
  }

  private async getActiveSessionForUserInternal(
    tx: Pick<PrismaService, '$queryRaw'>,
    userId: string,
  ): Promise<VoiceSessionRow | null> {
    const [row] = await tx.$queryRaw<VoiceSessionRow[]>`
      SELECT
        vs.id,
        vs.channel_id AS "channelId",
        vs.user_id AS "userId",
        vs.mute_state AS "muteState",
        vs.deafen_state AS "deafenState",
        vs.connection_status AS "connectionStatus",
        vs.media_state AS "mediaState",
        vs.router_id AS "routerId",
        vs.send_transport_id AS "sendTransportId",
        vs.recv_transport_id AS "recvTransportId",
        vs.producer_id AS "producerId",
        vs.joined_at AS "joinedAt",
        vs.updated_at AS "updatedAt",
        u.username,
        u.nickname AS "userNickname",
        u.avatar_attachment_id AS "avatarAttachmentId"
      FROM voice_sessions vs
      INNER JOIN users u ON u.id = vs.user_id
      INNER JOIN channels c ON c.id = vs.channel_id
      WHERE vs.user_id = ${userId}::uuid
        AND vs.ended_at IS NULL
        AND c.status = 'active'
      LIMIT 1
    `;

    return row ?? null;
  }

  private async getActiveSessionForUserInServer(
    tx: Pick<PrismaService, '$queryRaw'>,
    serverId: string,
    userId: string,
  ): Promise<VoiceSessionRow | null> {
    const [row] = await tx.$queryRaw<VoiceSessionRow[]>`
      SELECT
        vs.id,
        vs.channel_id AS "channelId",
        vs.user_id AS "userId",
        vs.mute_state AS "muteState",
        vs.deafen_state AS "deafenState",
        vs.connection_status AS "connectionStatus",
        vs.media_state AS "mediaState",
        vs.router_id AS "routerId",
        vs.send_transport_id AS "sendTransportId",
        vs.recv_transport_id AS "recvTransportId",
        vs.producer_id AS "producerId",
        vs.joined_at AS "joinedAt",
        vs.updated_at AS "updatedAt",
        u.username,
        u.nickname AS "userNickname",
        u.avatar_attachment_id AS "avatarAttachmentId"
      FROM voice_sessions vs
      INNER JOIN users u ON u.id = vs.user_id
      INNER JOIN channels c ON c.id = vs.channel_id
      WHERE vs.user_id = ${userId}::uuid
        AND c.server_id = ${serverId}::uuid
        AND vs.ended_at IS NULL
        AND c.status = 'active'
      LIMIT 1
    `;

    return row ?? null;
  }

  private async listActiveSessionsForChannel(
    tx: Pick<PrismaService, '$queryRaw'>,
    channelId: string,
  ): Promise<VoiceSessionRow[]> {
    return tx.$queryRaw<VoiceSessionRow[]>`
      SELECT
        vs.id,
        vs.channel_id AS "channelId",
        vs.user_id AS "userId",
        vs.mute_state AS "muteState",
        vs.deafen_state AS "deafenState",
        vs.connection_status AS "connectionStatus",
        vs.media_state AS "mediaState",
        vs.router_id AS "routerId",
        vs.send_transport_id AS "sendTransportId",
        vs.recv_transport_id AS "recvTransportId",
        vs.producer_id AS "producerId",
        vs.joined_at AS "joinedAt",
        vs.updated_at AS "updatedAt",
        u.username,
        u.nickname AS "userNickname",
        u.avatar_attachment_id AS "avatarAttachmentId"
      FROM voice_sessions vs
      INNER JOIN users u ON u.id = vs.user_id
      WHERE vs.channel_id = ${channelId}::uuid
        AND vs.ended_at IS NULL
      ORDER BY vs.joined_at ASC
    `;
  }

  private async listActiveProducersForChannel(
    tx: Pick<PrismaService, '$queryRaw'>,
    channelId: string,
  ): Promise<VoiceActiveProducer[]> {
    const rows = await tx.$queryRaw<VoiceActiveProducerRow[]>`
      SELECT
        channel_id AS "channelId",
        user_id AS "userId",
        producer_id AS "producerId",
        mute_state AS "muteState"
      FROM voice_sessions
      WHERE channel_id = ${channelId}::uuid
        AND ended_at IS NULL
        AND producer_id IS NOT NULL
      ORDER BY joined_at ASC
    `;

    return rows.map((row) => ({
      channel_id: row.channelId,
      kind: 'audio',
      paused: row.muteState,
      producer_id: row.producerId,
      user_id: row.userId,
    }));
  }

  private async listActiveSessionsForUsersInServer(
    tx: Pick<PrismaService, '$queryRaw'>,
    serverId: string,
    userIds: string[],
  ): Promise<VoiceSessionRow[]> {
    return tx.$queryRaw<VoiceSessionRow[]>`
      SELECT
        vs.id,
        vs.channel_id AS "channelId",
        vs.user_id AS "userId",
        vs.mute_state AS "muteState",
        vs.deafen_state AS "deafenState",
        vs.connection_status AS "connectionStatus",
        vs.media_state AS "mediaState",
        vs.router_id AS "routerId",
        vs.send_transport_id AS "sendTransportId",
        vs.recv_transport_id AS "recvTransportId",
        vs.producer_id AS "producerId",
        vs.joined_at AS "joinedAt",
        vs.updated_at AS "updatedAt",
        u.username,
        u.nickname AS "userNickname",
        u.avatar_attachment_id AS "avatarAttachmentId"
      FROM voice_sessions vs
      INNER JOIN users u ON u.id = vs.user_id
      INNER JOIN channels c ON c.id = vs.channel_id
      WHERE c.server_id = ${serverId}::uuid
        AND vs.user_id = ANY(${userIds}::uuid[])
        AND vs.ended_at IS NULL
        AND c.status = 'active'
      ORDER BY vs.joined_at ASC
    `;
  }

  private async endSession(tx: RawSqlExecutor, sessionId: string): Promise<void> {
    await tx.$executeRaw`
      UPDATE voice_sessions
      SET
        connection_status = ${VoiceConnectionStatus.Disconnected},
        media_state = ${VoiceMediaState.Idle},
        negotiation_deadline = NULL,
        ended_at = COALESCE(ended_at, NOW()),
        updated_at = NOW()
      WHERE id = ${sessionId}::uuid
        AND ended_at IS NULL
    `;
  }

  private publishVoiceJoined(row: VoiceSessionRow, requestId?: string) {
    this.realtimePublisher.publishToRoom(
      buildRealtimeRoom('voice', row.channelId),
      RealtimeEvent.VoiceMemberJoined,
      toVoiceSessionSummary(row),
      requestId,
    );
  }

  private publishVoiceLeft(row: VoiceSessionRow, reason: string, requestId?: string) {
    this.realtimePublisher.leaveUserRooms([row.userId], buildRealtimeRoom('voice', row.channelId));
    this.realtimePublisher.publishToRoom(
      buildRealtimeRoom('voice', row.channelId),
      RealtimeEvent.VoiceMemberLeft,
      {
        channel_id: row.channelId,
        left_at: new Date().toISOString(),
        reason,
        user_id: row.userId,
      },
      requestId,
    );
  }

  private publishVoiceStateChanged(row: VoiceSessionRow, requestId?: string) {
    this.realtimePublisher.publishToRoom(
      buildRealtimeRoom('voice', row.channelId),
      RealtimeEvent.VoiceStateChanged,
      {
        channel_id: row.channelId,
        connection_status: row.connectionStatus,
        deafen_state: row.deafenState,
        media_state: row.mediaState,
        mute_state: row.muteState,
        session_id: row.id,
        updated_at: row.updatedAt.toISOString(),
        user_id: row.userId,
      },
      requestId,
    );
  }
}
