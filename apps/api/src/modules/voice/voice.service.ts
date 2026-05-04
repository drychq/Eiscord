import { HttpStatus, Injectable } from '@nestjs/common';

import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { PermissionAction } from '../../common/permissions/permission.types';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
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

@Injectable()
export class VoiceService {
  constructor(
    private readonly auditService: AuditService,
    private readonly permissionsService: PermissionsService,
    private readonly prisma: PrismaService,
    private readonly realtimePublisher: RealtimePublisher,
  ) {}

  async joinChannel(
    user: AuthenticatedUserContext,
    channelId: string,
    dto: JoinVoiceChannelDto,
    requestId?: string,
  ): Promise<VoiceSessionSummary> {
    await this.permissionsService.assertAllowed({
      action: PermissionAction.JoinVoice,
      requestId,
      resource: { id: channelId, type: 'voice' },
      user,
    });
    await this.getActiveVoiceChannel(channelId);

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
          connection_status
        )
        VALUES (
          ${channelId}::uuid,
          ${user.userId}::uuid,
          ${dto.initial_mute_state ?? false},
          ${dto.initial_deafen_state ?? false},
          'connected'
        )
        RETURNING
          id,
          channel_id AS "channelId",
          user_id AS "userId",
          mute_state AS "muteState",
          deafen_state AS "deafenState",
          connection_status AS "connectionStatus",
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
    }

    this.publishVoiceJoined(result.created, requestId);

    await this.auditService.record({
      action: 'JoinVoiceChannel',
      actorId: user.userId,
      requestId,
      result: 'success',
      targetId: channelId,
      targetType: 'voice_channel',
    });

    return toVoiceSessionSummary(result.created);
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
        joined_at AS "joinedAt",
        updated_at AS "updatedAt",
        (SELECT username FROM users WHERE id = voice_sessions.user_id) AS "username",
        (SELECT nickname FROM users WHERE id = voice_sessions.user_id) AS "userNickname",
        (SELECT avatar_attachment_id FROM users WHERE id = voice_sessions.user_id) AS "avatarAttachmentId"
    `;

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
      this.publishVoiceLeft(session, reason, requestId);
    }

    return current.map(toVoiceSessionSummary);
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
        connection_status = 'disconnected',
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
        mute_state: row.muteState,
        session_id: row.id,
        updated_at: row.updatedAt.toISOString(),
        user_id: row.userId,
      },
      requestId,
    );
  }
}
