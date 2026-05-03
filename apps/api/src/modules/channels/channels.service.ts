import { randomUUID } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';

import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildRealtimeRoom } from '../realtime/realtime.rooms';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { ChannelRow, ChannelSummary, toChannelSummary } from './channels.presenter';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

type MembershipRow = {
  serverId: string;
};

@Injectable()
export class ChannelsService {
  constructor(
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
    private readonly realtimePublisher: RealtimePublisher,
  ) {}

  async createChannel(
    user: AuthenticatedUserContext,
    serverId: string,
    dto: CreateChannelDto,
    requestId?: string,
  ): Promise<ChannelSummary> {
    this.assertNoPermissionOverwrites(dto.permission_overwrites);
    const name = dto.name.trim();

    if (name.length === 0) {
      await this.recordFailure('CreateChannel', user.userId, serverId, 'empty_name', requestId);
      throw new AppError(
        ErrorCode.ValidationFailed,
        'Channel name cannot be empty.',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.assertServerMember(user.userId, serverId, 'CreateChannel', requestId);
    const channel = await this.prisma.$transaction(async (tx) => {
      const [created] = await tx.$queryRaw<ChannelRow[]>`
        INSERT INTO channels (id, server_id, name, type, topic, sort_order, status)
        VALUES (
          ${randomUUID()}::uuid,
          ${serverId}::uuid,
          ${name},
          ${dto.type},
          ${normalizeNullableText(dto.topic)},
          ${dto.sort_order ?? 0},
          'active'
        )
        RETURNING
          id,
          server_id AS "serverId",
          name,
          type,
          topic,
          sort_order AS "sortOrder",
          status,
          created_at AS "createdAt"
      `;

      await tx.$executeRaw`
        INSERT INTO read_states (id, user_id, scope_type, channel_id, last_read_message_id, unread_count)
        SELECT gen_random_uuid(), m.user_id, 'channel', ${created.id}::uuid, null, 0
        FROM memberships m
        WHERE m.server_id = ${serverId}::uuid
          AND m.member_status IN ('active', 'muted')
        ON CONFLICT (user_id, channel_id) DO NOTHING
      `;

      return created;
    });

    await this.auditService.record({
      action: 'CreateChannel',
      actorId: user.userId,
      requestId,
      result: 'success',
      targetId: channel.id,
      targetType: 'channel',
    });
    this.publishChannelChanged(channel, 'created', requestId);

    return toChannelSummary(channel);
  }

  async updateChannel(
    user: AuthenticatedUserContext,
    channelId: string,
    dto: UpdateChannelDto,
    requestId?: string,
  ): Promise<ChannelSummary> {
    this.assertNoPermissionOverwrites(dto.permission_overwrites);
    const current = await this.getActiveChannel(channelId, user.userId, 'UpdateChannel', requestId);
    const name = dto.name !== undefined ? dto.name.trim() : current.name;

    if (name.length === 0) {
      await this.recordFailure('UpdateChannel', user.userId, current.serverId, 'empty_name', requestId);
      throw new AppError(
        ErrorCode.ValidationFailed,
        'Channel name cannot be empty.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const [updated] = await this.prisma.$queryRaw<ChannelRow[]>`
      UPDATE channels
      SET
        name = ${name},
        type = ${dto.type ?? current.type},
        topic = ${dto.topic !== undefined ? normalizeNullableText(dto.topic) : current.topic},
        sort_order = ${dto.sort_order ?? current.sortOrder},
        updated_at = NOW()
      WHERE id = ${channelId}::uuid
      RETURNING
        id,
        server_id AS "serverId",
        name,
        type,
        topic,
        sort_order AS "sortOrder",
        status,
        created_at AS "createdAt"
    `;

    await this.auditService.record({
      action: 'UpdateChannel',
      actorId: user.userId,
      requestId,
      result: 'success',
      targetId: channelId,
      targetType: 'channel',
    });
    this.publishChannelChanged(updated, 'updated', requestId);

    return toChannelSummary(updated);
  }

  async deleteChannel(
    user: AuthenticatedUserContext,
    channelId: string,
    requestId?: string,
  ): Promise<ChannelSummary> {
    const current = await this.getActiveChannel(channelId, user.userId, 'DeleteChannel', requestId);
    const [deleted] = await this.prisma.$queryRaw<ChannelRow[]>`
      UPDATE channels
      SET status = 'deleted', updated_at = NOW()
      WHERE id = ${channelId}::uuid
      RETURNING
        id,
        server_id AS "serverId",
        name,
        type,
        topic,
        sort_order AS "sortOrder",
        status,
        created_at AS "createdAt"
    `;

    await this.auditService.record({
      action: 'DeleteChannel',
      actorId: user.userId,
      requestId,
      result: 'success',
      targetId: channelId,
      targetType: 'channel',
    });
    this.publishChannelChanged(deleted, 'deleted', requestId);

    return toChannelSummary({ ...deleted, serverId: current.serverId });
  }

  private async assertServerMember(
    userId: string,
    serverId: string,
    action: string,
    requestId?: string,
  ): Promise<void> {
    const [membership] = await this.prisma.$queryRaw<MembershipRow[]>`
      SELECT m.server_id AS "serverId"
      FROM memberships m
      INNER JOIN servers s ON s.id = m.server_id
      WHERE m.server_id = ${serverId}::uuid
        AND m.user_id = ${userId}::uuid
        AND m.member_status IN ('active', 'muted')
        AND s.status = 'active'
      LIMIT 1
    `;

    if (!membership) {
      await this.recordFailure(action, userId, serverId, 'not_server_member', requestId);
      throw new AppError(
        ErrorCode.PermissionDenied,
        'Server membership is required.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async getActiveChannel(
    channelId: string,
    userId: string,
    action: string,
    requestId?: string,
  ): Promise<ChannelRow> {
    const [channel] = await this.prisma.$queryRaw<ChannelRow[]>`
      SELECT
        c.id,
        c.server_id AS "serverId",
        c.name,
        c.type,
        c.topic,
        c.sort_order AS "sortOrder",
        c.status,
        c.created_at AS "createdAt"
      FROM channels c
      INNER JOIN servers s ON s.id = c.server_id
      INNER JOIN memberships m
        ON m.server_id = c.server_id
       AND m.user_id = ${userId}::uuid
      WHERE c.id = ${channelId}::uuid
        AND c.status = 'active'
        AND s.status = 'active'
        AND m.member_status IN ('active', 'muted')
      LIMIT 1
    `;

    if (!channel) {
      await this.recordFailure(action, userId, channelId, 'channel_not_found_or_forbidden', requestId);
      throw new AppError(
        ErrorCode.ResourceNotFound,
        'Channel was not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    return channel;
  }

  private assertNoPermissionOverwrites(overwrites: unknown[] | undefined): void {
    if (overwrites && overwrites.length > 0) {
      throw new AppError(
        ErrorCode.ValidationFailed,
        'Channel permission overwrites are not supported until M4.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private publishChannelChanged(
    channel: ChannelRow,
    changeType: 'created' | 'deleted' | 'updated',
    requestId?: string,
  ) {
    this.realtimePublisher.publishToRoom(
      buildRealtimeRoom('server', channel.serverId),
      RealtimeEvent.ChannelChanged,
      {
        change_type: changeType,
        channel: toChannelSummary(channel),
        server_id: channel.serverId,
      },
      requestId,
    );
  }

  private async recordFailure(
    action: string,
    actorId: string,
    targetId: string,
    failureReason: string,
    requestId?: string,
  ) {
    await this.auditService.record({
      action,
      actorId,
      failureReason,
      requestId,
      result: 'failure',
      targetId,
      targetType: 'channel',
    });
  }
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}
