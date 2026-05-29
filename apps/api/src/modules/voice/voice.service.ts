import { HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ErrorCode, JoinVoiceMediaResponse, RealtimeEvent } from '@eiscord/shared';

import { AuthenticatedUserContext } from '../../core/auth/auth.types';
import { AppError } from '../../core/errors/app-error';
import type { EventCollector } from '../../infra/persistence/event-collector';
import { PersistenceCoordinator } from '../../infra/persistence/persistence-coordinator.service';
import { PrismaService } from '../../infra/persistence/prisma.service';
import { PermissionAction } from '../../core/permissions/permission.types';
import { PermissionsService } from '../../core/permissions/permissions.service';
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
import { VoiceRepository } from './voice.repository';

export type JoinVoiceChannelResult = VoiceSessionSummary & {
  media: JoinVoiceMediaResponse;
};

@Injectable()
export class VoiceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VoiceService.name);
  private negotiationSweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly mediaSignalingService: MediaSignalingService,
    private readonly permissionsService: PermissionsService,
    private readonly persistence: PersistenceCoordinator,
    private readonly prisma: PrismaService,
    private readonly realtimePublisher: RealtimePublisher,
    private readonly turnCredentialService: TurnCredentialService,
    private readonly voiceRepo: VoiceRepository,
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

    const result = await this.persistence.runWithEvents(async (tx, events) => {
      const previous = await this.voiceRepo.findActiveSessionForUser(tx, user.userId);

      if (previous) {
        await this.voiceRepo.endSession(tx, previous.id);
      }

      const created = await this.voiceRepo.insertVoiceSession(tx, {
        channelId,
        deafenState: dto.initial_deafen_state ?? false,
        muteState: dto.initial_mute_state ?? false,
        negotiationTimeoutMs,
        routerId: router.routerId,
        userId: user.userId,
      });

      if (previous) {
        this.enqueueVoiceLeft(events, previous, 'switch_channel', requestId);
      }
      this.enqueueVoiceJoined(events, created, requestId);
      events.audit({
        action: 'JoinVoiceChannel',
        actorId: user.userId,
        requestId,
        result: 'success',
        targetId: channelId,
        targetType: 'voice_channel',
      });

      return { created, previous };
    });

    if (result.previous) {
      void this.mediaSignalingService.releaseSession(result.previous.id, 'switch_channel').catch((error) => {
        this.logger.warn(`Failed to release previous voice session: ${String(error)}`);
      });
    }

    const activeProducerRows = await this.voiceRepo.listActiveProducerRowsForChannel(
      this.prisma,
      channelId,
    );

    return {
      ...toVoiceSessionSummary(result.created),
      media: {
        active_producers: activeProducerRows.map((row) => ({
          channel_id: row.channelId,
          kind: 'audio',
          paused: row.muteState,
          producer_id: row.producerId,
          user_id: row.userId,
        })),
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
    const rows = await this.voiceRepo.listActiveSessionsForChannel(this.prisma, channelId);

    return rows.map(toVoiceSessionSummary);
  }

  async refreshIceServers(user: AuthenticatedUserContext, sessionId: string) {
    const current = await this.voiceRepo.findActiveSessionById(this.prisma, sessionId);

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
    const current = await this.voiceRepo.findActiveSessionById(this.prisma, sessionId);

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

    await this.persistence.runWithEvents(async (tx, events) => {
      await this.voiceRepo.endSession(tx, sessionId);
      this.enqueueVoiceLeft(events, current, 'manual_leave', requestId);
      events.audit({
        action: 'LeaveVoiceChannel',
        actorId: user.userId,
        requestId,
        result: 'success',
        targetId: sessionId,
        targetType: 'voice_session',
      });
    });
    await this.mediaSignalingService.releaseSession(sessionId, 'manual_leave').catch((error) => {
      this.logger.warn(`Failed to release voice session media plane: ${String(error)}`);
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

    const current = await this.voiceRepo.findActiveSessionById(this.prisma, sessionId);

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

    const updated = await this.persistence.runWithEvents(async (tx, events) => {
      const row = await this.voiceRepo.updateVoiceSessionState(tx, {
        connectionStatus: dto.connection_status ?? current.connectionStatus,
        deafenState: dto.deafen_state ?? current.deafenState,
        muteState: dto.mute_state ?? current.muteState,
        sessionId,
      });

      this.enqueueVoiceStateChanged(events, row, requestId);
      events.audit({
        action: 'UpdateVoiceState',
        actorId: user.userId,
        requestId,
        result: 'success',
        targetId: sessionId,
        targetType: 'voice_session',
      });

      return row;
    });

    if (dto.mute_state !== undefined && dto.mute_state !== current.muteState) {
      const op = dto.mute_state
        ? this.mediaSignalingService.pauseProducer(updated.producerId)
        : this.mediaSignalingService.resumeProducer(updated.producerId);
      await op.catch((error) => {
        this.logger.warn(`Failed to toggle producer state: ${String(error)}`);
      });
    }

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

    await this.persistence.runWithEvents(async (tx, events) => {
      await this.voiceRepo.endSession(tx, current.id);
      this.enqueueVoiceLeft(events, current, reason, requestId);
    });
    await this.mediaSignalingService.releaseSession(current.id, reason).catch(() => undefined);

    return toVoiceSessionSummary(current);
  }

  async releaseUserActiveSessionForServer(
    serverId: string,
    userId: string,
    reason: string,
    requestId?: string,
  ): Promise<VoiceSessionSummary | null> {
    const current = await this.voiceRepo.findActiveSessionForUserInServer(this.prisma, serverId, userId);

    if (!current) {
      return null;
    }

    await this.persistence.runWithEvents(async (tx, events) => {
      await this.voiceRepo.endSession(tx, current.id);
      this.enqueueVoiceLeft(events, current, reason, requestId);
    });
    await this.mediaSignalingService.releaseSession(current.id, reason).catch(() => undefined);

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

    const current = await this.voiceRepo.listActiveSessionsForChannel(this.prisma, channelId);
    const targeted = current.filter((session) => userIds.includes(session.userId));

    if (targeted.length === 0) {
      return [];
    }

    await this.persistence.runWithEvents(async (tx, events) => {
      for (const session of targeted) {
        await this.voiceRepo.endSession(tx, session.id);
        this.enqueueVoiceLeft(events, session, reason, requestId);
      }
    });

    for (const session of targeted) {
      await this.mediaSignalingService.releaseSession(session.id, reason).catch(() => undefined);
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

    const activeSessions = await this.voiceRepo.listActiveSessionsForUsersInServer(
      this.prisma,
      serverId,
      userIds,
    );
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

    await this.persistence.runWithEvents(async (tx, events) => {
      for (const session of toRelease) {
        await this.voiceRepo.endSession(tx, session.id);
        this.enqueueVoiceLeft(events, session, reason, requestId);
      }
    });

    for (const session of toRelease) {
      await this.mediaSignalingService.releaseSession(session.id, reason).catch(() => undefined);
    }

    return toRelease.map(toVoiceSessionSummary);
  }

  async releaseChannelActiveSessions(
    channelId: string,
    reason: string,
    requestId?: string,
  ): Promise<VoiceSessionSummary[]> {
    const current = await this.voiceRepo.listActiveSessionsForChannel(this.prisma, channelId);

    if (current.length === 0) {
      return [];
    }

    await this.persistence.runWithEvents(async (tx, events) => {
      for (const session of current) {
        await this.voiceRepo.endSession(tx, session.id);
        this.enqueueVoiceLeft(events, session, reason, requestId);
      }
    });

    for (const session of current) {
      await this.mediaSignalingService.releaseSession(session.id, reason).catch(() => undefined);
    }

    return current.map(toVoiceSessionSummary);
  }

  async sweepNegotiationTimeouts(): Promise<VoiceSessionSummary[]> {
    const expired = await this.voiceRepo.findExpiredNegotiations();

    if (expired.length === 0) {
      return [];
    }

    await this.persistence.runWithEvents(async (tx, events) => {
      for (const session of expired) {
        await this.voiceRepo.endSession(tx, session.id);
        this.enqueueVoiceLeft(events, session, 'signaling_timeout');
      }
    });

    for (const session of expired) {
      await this.mediaSignalingService.releaseSession(session.id, 'signaling_timeout').catch(() => undefined);
    }

    return expired.map(toVoiceSessionSummary);
  }

  private async getActiveVoiceChannel(channelId: string): Promise<void> {
    const channel = await this.voiceRepo.findActiveVoiceChannel(channelId);

    if (!channel) {
      throw new AppError(ErrorCode.ResourceNotFound, 'Voice channel was not found.', HttpStatus.NOT_FOUND);
    }
  }

  private async assertRoomCapacity(channelId: string, userId: string): Promise<void> {
    const activeCount = await this.voiceRepo.countActiveSessionsForChannel(channelId, userId);
    const maxParticipants = this.configService.get<number>('VOICE_MAX_PARTICIPANTS_PER_ROOM') ?? 20;

    if (Number.isFinite(activeCount) && activeCount >= maxParticipants) {
      throw new AppError(ErrorCode.Conflict, 'Voice channel is full.', HttpStatus.CONFLICT);
    }
  }

  async getActiveSessionForUser(userId: string): Promise<VoiceSessionRow | null> {
    return this.voiceRepo.findActiveSessionForUser(this.prisma, userId);
  }

  private enqueueVoiceJoined(events: EventCollector, row: VoiceSessionRow, requestId?: string) {
    events.publish(
      buildRealtimeRoom('voice', row.channelId),
      RealtimeEvent.VoiceMemberJoined,
      toVoiceSessionSummary(row),
      requestId,
    );
  }

  private enqueueVoiceLeft(
    events: EventCollector,
    row: VoiceSessionRow,
    reason: string,
    requestId?: string,
  ) {
    this.realtimePublisher.leaveUserRooms([row.userId], buildRealtimeRoom('voice', row.channelId));
    events.publish(
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

  private enqueueVoiceStateChanged(events: EventCollector, row: VoiceSessionRow, requestId?: string) {
    events.publish(
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
