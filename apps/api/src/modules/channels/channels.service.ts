import { randomUUID } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';

import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { PermissionAction } from '../../common/permissions/permission.types';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { buildRealtimeRoom, buildUserRoom } from '../realtime/realtime.rooms';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { VoiceService } from '../voice/voice.service';
import {
  ChannelRow,
  ChannelSummary,
  PermissionOverwriteRow,
  toChannelSummary,
} from './channels.presenter';
import { CreateChannelDto } from './dto/create-channel.dto';
import { PermissionOverwriteDto } from './dto/permission-overwrite.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

type RawSqlExecutor = Pick<PrismaService, '$executeRaw' | '$queryRaw'>;

type NormalizedPermissionOverwrite = {
  allowBits: bigint;
  denyBits: bigint;
  targetId: string;
  targetType: 'member' | 'role';
};

type ServerUserRow = {
  userId: string;
};

@Injectable()
export class ChannelsService {
  constructor(
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly permissionsService: PermissionsService,
    private readonly prisma: PrismaService,
    private readonly realtimePublisher: RealtimePublisher,
    private readonly voiceService: VoiceService,
  ) {}

  async createChannel(
    user: AuthenticatedUserContext,
    serverId: string,
    dto: CreateChannelDto,
    requestId?: string,
  ): Promise<ChannelSummary> {
    const overwrites = normalizePermissionOverwrites(dto.permission_overwrites);
    const name = dto.name.trim();

    if (name.length === 0) {
      await this.recordFailure('CreateChannel', user.userId, serverId, 'empty_name', requestId);
      throw new AppError(
        ErrorCode.ValidationFailed,
        'Channel name cannot be empty.',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.permissionsService.assertAllowed({
      action: PermissionAction.ManageChannel,
      requestId,
      resource: { id: serverId, type: 'server' },
      user,
    });
    const result = await this.prisma.$transaction(async (tx) => {
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

      const permissionOverwrites = await this.replacePermissionOverwrites(
        tx,
        created.id,
        serverId,
        overwrites,
      );

      return { channel: created, permissionOverwrites };
    });

    await this.auditService.record({
      action: 'CreateChannel',
      actorId: user.userId,
      requestId,
      result: 'success',
      targetId: result.channel.id,
      targetType: 'channel',
    });
    this.publishChannelChanged(result.channel, 'created', result.permissionOverwrites, requestId);

    if (overwrites.length > 0) {
      await this.publishPermissionChanged(result.channel, 'channel', requestId);
    }

    return toChannelSummary(result.channel, result.permissionOverwrites);
  }

  async updateChannel(
    user: AuthenticatedUserContext,
    channelId: string,
    dto: UpdateChannelDto,
    requestId?: string,
  ): Promise<ChannelSummary> {
    const overwrites =
      dto.permission_overwrites === undefined
        ? undefined
        : normalizePermissionOverwrites(dto.permission_overwrites);
    await this.permissionsService.assertAllowed({
      action: PermissionAction.ManageChannel,
      requestId,
      resource: { id: channelId, type: 'channel' },
      user,
    });
    const current = await this.getActiveChannel(channelId, 'UpdateChannel', user.userId, requestId);
    const name = dto.name !== undefined ? dto.name.trim() : current.name;

    if (name.length === 0) {
      await this.recordFailure('UpdateChannel', user.userId, current.serverId, 'empty_name', requestId);
      throw new AppError(
        ErrorCode.ValidationFailed,
        'Channel name cannot be empty.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const [updated] = await tx.$queryRaw<ChannelRow[]>`
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
      const permissionOverwrites =
        overwrites === undefined
          ? await this.listPermissionOverwrites(tx, channelId)
          : await this.replacePermissionOverwrites(tx, channelId, updated.serverId, overwrites);

      return { channel: updated, permissionOverwrites };
    });

    await this.auditService.record({
      action: 'UpdateChannel',
      actorId: user.userId,
      requestId,
      result: 'success',
      targetId: channelId,
      targetType: 'channel',
    });
    this.publishChannelChanged(result.channel, 'updated', result.permissionOverwrites, requestId);

    if (overwrites !== undefined) {
      await this.publishPermissionChanged(result.channel, 'channel', requestId);
    }

    return toChannelSummary(result.channel, result.permissionOverwrites);
  }

  async deleteChannel(
    user: AuthenticatedUserContext,
    channelId: string,
    requestId?: string,
  ): Promise<ChannelSummary> {
    await this.permissionsService.assertAllowed({
      action: PermissionAction.ManageChannel,
      requestId,
      resource: { id: channelId, type: 'channel' },
      user,
    });
    const current = await this.getActiveChannel(channelId, 'DeleteChannel', user.userId, requestId);
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
    if (deleted.type === 'voice') {
      await this.voiceService.releaseChannelActiveSessions(
        deleted.id,
        'channel_deleted',
        requestId,
      );
    }
    this.publishChannelChanged(deleted, 'deleted', [], requestId);
    await this.publishPermissionChanged(deleted, 'channel', requestId);

    return toChannelSummary({ ...deleted, serverId: current.serverId }, []);
  }

  private async getActiveChannel(
    channelId: string,
    action: string,
    userId: string,
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

  private async replacePermissionOverwrites(
    tx: RawSqlExecutor,
    channelId: string,
    serverId: string,
    overwrites: NormalizedPermissionOverwrite[],
  ): Promise<PermissionOverwriteRow[]> {
    await this.validatePermissionOverwriteTargets(tx, serverId, overwrites);
    await tx.$executeRaw`
      DELETE FROM permission_overwrites
      WHERE channel_id = ${channelId}::uuid
    `;

    for (const overwrite of overwrites) {
      await tx.$executeRaw`
        INSERT INTO permission_overwrites (
          id,
          channel_id,
          target_type,
          target_id,
          allow_bits,
          deny_bits
        )
        VALUES (
          gen_random_uuid(),
          ${channelId}::uuid,
          ${overwrite.targetType},
          ${overwrite.targetId}::uuid,
          ${overwrite.allowBits},
          ${overwrite.denyBits}
        )
      `;
    }

    return this.listPermissionOverwrites(tx, channelId);
  }

  private async validatePermissionOverwriteTargets(
    tx: RawSqlExecutor,
    serverId: string,
    overwrites: NormalizedPermissionOverwrite[],
  ): Promise<void> {
    for (const overwrite of overwrites) {
      if (overwrite.targetType === 'role') {
        const [role] = await tx.$queryRaw<{ id: string }[]>`
          SELECT id
          FROM roles
          WHERE id = ${overwrite.targetId}::uuid
            AND server_id = ${serverId}::uuid
          LIMIT 1
        `;

        if (!role) {
          throw new AppError(
            ErrorCode.ResourceNotFound,
            'Permission overwrite role target was not found.',
            HttpStatus.NOT_FOUND,
          );
        }
      } else {
        const [member] = await tx.$queryRaw<{ id: string }[]>`
          SELECT id
          FROM memberships
          WHERE id = ${overwrite.targetId}::uuid
            AND server_id = ${serverId}::uuid
            AND member_status IN ('active', 'muted')
          LIMIT 1
        `;

        if (!member) {
          throw new AppError(
            ErrorCode.ResourceNotFound,
            'Permission overwrite member target was not found.',
            HttpStatus.NOT_FOUND,
          );
        }
      }
    }
  }

  private async listPermissionOverwrites(
    tx: RawSqlExecutor,
    channelId: string,
  ): Promise<PermissionOverwriteRow[]> {
    return tx.$queryRaw<PermissionOverwriteRow[]>`
      SELECT
        id,
        channel_id AS "channelId",
        target_type AS "targetType",
        target_id AS "targetId",
        allow_bits AS "allowBits",
        deny_bits AS "denyBits"
      FROM permission_overwrites
      WHERE channel_id = ${channelId}::uuid
      ORDER BY target_type ASC, created_at ASC
    `;
  }

  private publishChannelChanged(
    channel: ChannelRow,
    changeType: 'created' | 'deleted' | 'updated',
    permissionOverwrites: PermissionOverwriteRow[],
    requestId?: string,
  ) {
    this.realtimePublisher.publishToRoom(
      buildRealtimeRoom('server', channel.serverId),
      RealtimeEvent.ChannelChanged,
      {
        change_type: changeType,
        channel: toChannelSummary(channel, permissionOverwrites),
        server_id: channel.serverId,
      },
      requestId,
    );
  }

  private async publishPermissionChanged(
    channel: ChannelRow,
    changeScope: 'channel',
    requestId?: string,
  ) {
    const [serverUsers, allowedUsers] = await Promise.all([
      this.listServerUserIds(channel.serverId),
      this.permissionsService.listUsersWithChannelPermission(channel.id, PermissionAction.ViewChannel),
    ]);
    const deniedUsers = serverUsers.filter((userId) => !allowedUsers.includes(userId));
    const roomsToLeave = [buildRealtimeRoom('channel', channel.id)];

    if (channel.type === 'voice') {
      roomsToLeave.push(buildRealtimeRoom('voice', channel.id));
    }

    this.realtimePublisher.leaveUserRooms(deniedUsers, roomsToLeave);

    if (channel.type === 'voice') {
      await this.voiceService.releaseUsersActiveSessionsForChannel(
        channel.id,
        deniedUsers,
        'permission_removed',
        requestId,
      );
    }

    for (const userId of serverUsers) {
      this.realtimePublisher.publishToRoom(
        buildUserRoom(userId),
        RealtimeEvent.PermissionChanged,
        {
          affected_user_ids: serverUsers,
          change_scope: changeScope,
          resource_id: channel.id,
          server_id: channel.serverId,
        },
        requestId,
      );

      const notifResult = await this.notificationsService.createNotification(this.prisma, {
        contentPreview: `Permissions changed for channel #${channel.name}`,
        dedupeKey: `permission:${channel.id}:${userId}`,
        sourceId: channel.id,
        sourceType: 'channel',
        type: 'PERMISSION_CHANGED',
        userId,
      });
      if (notifResult.created) {
        this.notificationsService.publishCreated(notifResult.notification, requestId);
      }
    }
  }

  private async listServerUserIds(serverId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<ServerUserRow[]>`
      SELECT user_id AS "userId"
      FROM memberships
      WHERE server_id = ${serverId}::uuid
        AND member_status IN ('active', 'muted')
    `;

    return rows.map((row) => row.userId);
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

function normalizePermissionOverwrites(
  overwrites: PermissionOverwriteDto[] | undefined,
): NormalizedPermissionOverwrite[] {
  const normalized = (overwrites ?? []).map((overwrite) => ({
    allowBits: BigInt(overwrite.allow_bits),
    denyBits: BigInt(overwrite.deny_bits),
    targetId: overwrite.target_id,
    targetType: overwrite.target_type,
  }));
  const seen = new Set<string>();

  for (const overwrite of normalized) {
    const key = `${overwrite.targetType}:${overwrite.targetId}`;

    if (seen.has(key)) {
      throw new AppError(
        ErrorCode.ValidationFailed,
        'Duplicate permission overwrite target.',
        HttpStatus.BAD_REQUEST,
      );
    }

    seen.add(key);
  }

  return normalized;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}
