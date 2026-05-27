import { Injectable } from '@nestjs/common';

import { VoiceConnectionStatus, VoiceMediaState } from '@eiscord/shared';

import { PrismaService } from '../../common/persistence/prisma.service';
import type { RawSqlExecutor } from '../../common/persistence/types';
import type { VoiceSessionRow } from './voice.presenter';

export type VoiceChannelRow = {
  channelId: string;
  serverId: string;
};

export type VoiceRoomCountRow = {
  count: bigint | number | string;
};

export type VoiceActiveProducerRow = {
  channelId: string;
  muteState: boolean;
  producerId: string;
  userId: string;
};

export type InsertVoiceSessionInput = {
  channelId: string;
  deafenState: boolean;
  muteState: boolean;
  negotiationTimeoutMs: number;
  routerId: string;
  userId: string;
};

export type UpdateVoiceSessionStateInput = {
  connectionStatus: string;
  deafenState: boolean;
  muteState: boolean;
  sessionId: string;
};

@Injectable()
export class VoiceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveVoiceChannel(channelId: string): Promise<VoiceChannelRow | null> {
    return this.prisma.$queryRaw<VoiceChannelRow[]>`
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
    `.then((rows) => rows[0] ?? null);
  }

  async countActiveSessionsForChannel(channelId: string, excludeUserId: string): Promise<number> {
    const [row] = await this.prisma.$queryRaw<VoiceRoomCountRow[]>`
      SELECT COUNT(*)::text AS "count"
      FROM voice_sessions
      WHERE channel_id = ${channelId}::uuid
        AND user_id <> ${excludeUserId}::uuid
        AND ended_at IS NULL
    `;

    return Number(row?.count ?? 0);
  }

  async insertVoiceSession(
    executor: RawSqlExecutor,
    input: InsertVoiceSessionInput,
  ): Promise<VoiceSessionRow> {
    const [created] = await executor.$queryRaw<VoiceSessionRow[]>`
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
        ${input.channelId}::uuid,
        ${input.userId}::uuid,
        ${input.muteState},
        ${input.deafenState},
        ${VoiceConnectionStatus.Connecting},
        ${VoiceMediaState.Negotiating},
        ${input.routerId},
        NOW() + (${input.negotiationTimeoutMs}::int * INTERVAL '1 millisecond')
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
        (SELECT username FROM users WHERE id = ${input.userId}::uuid) AS "username",
        (SELECT nickname FROM users WHERE id = ${input.userId}::uuid) AS "userNickname",
        (SELECT avatar_attachment_id FROM users WHERE id = ${input.userId}::uuid) AS "avatarAttachmentId"
    `;

    return created;
  }

  async updateVoiceSessionState(
    tx: RawSqlExecutor,
    input: UpdateVoiceSessionStateInput,
  ): Promise<VoiceSessionRow> {
    const [updated] = await tx.$queryRaw<VoiceSessionRow[]>`
      UPDATE voice_sessions
      SET
        mute_state = ${input.muteState},
        deafen_state = ${input.deafenState},
        connection_status = ${input.connectionStatus},
        updated_at = NOW()
      WHERE id = ${input.sessionId}::uuid
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

    return updated;
  }

  findExpiredNegotiations(): Promise<VoiceSessionRow[]> {
    return this.prisma.$queryRaw<VoiceSessionRow[]>`
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
  }

  findActiveSessionById(
    executor: RawSqlExecutor,
    sessionId: string,
  ): Promise<VoiceSessionRow | null> {
    return executor.$queryRaw<VoiceSessionRow[]>`
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
    `.then((rows) => rows[0] ?? null);
  }

  findActiveSessionForUser(
    executor: RawSqlExecutor,
    userId: string,
  ): Promise<VoiceSessionRow | null> {
    return executor.$queryRaw<VoiceSessionRow[]>`
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
    `.then((rows) => rows[0] ?? null);
  }

  findActiveSessionForUserInServer(
    executor: RawSqlExecutor,
    serverId: string,
    userId: string,
  ): Promise<VoiceSessionRow | null> {
    return executor.$queryRaw<VoiceSessionRow[]>`
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
    `.then((rows) => rows[0] ?? null);
  }

  listActiveSessionsForChannel(
    executor: RawSqlExecutor,
    channelId: string,
  ): Promise<VoiceSessionRow[]> {
    return executor.$queryRaw<VoiceSessionRow[]>`
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

  listActiveProducerRowsForChannel(
    executor: RawSqlExecutor,
    channelId: string,
  ): Promise<VoiceActiveProducerRow[]> {
    return executor.$queryRaw<VoiceActiveProducerRow[]>`
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
  }

  listActiveSessionsForUsersInServer(
    executor: RawSqlExecutor,
    serverId: string,
    userIds: string[],
  ): Promise<VoiceSessionRow[]> {
    return executor.$queryRaw<VoiceSessionRow[]>`
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

  async endSession(executor: RawSqlExecutor, sessionId: string): Promise<void> {
    await executor.$executeRaw`
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
}
