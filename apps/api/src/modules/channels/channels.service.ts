import { HttpStatus, Injectable } from '@nestjs/common';

import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { AppError } from '../../common/errors/app-error';
import type { EventCollector } from '../../common/persistence/event-collector';
import { PersistenceCoordinator } from '../../common/persistence/persistence-coordinator.service';
import { PrismaService } from '../../common/persistence/prisma.service';
import type { RawSqlExecutor } from '../../common/persistence/types';
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
import {
  ChannelsRepository,
  type NormalizedPermissionOverwrite,
} from './channels.repository';
import { CreateChannelDto } from './dto/create-channel.dto';
import { PermissionOverwriteDto } from './dto/permission-overwrite.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly auditService: AuditService,
    private readonly channelsRepo: ChannelsRepository,
    private readonly notificationsService: NotificationsService,
    private readonly permissionsService: PermissionsService,
    private readonly persistence: PersistenceCoordinator,
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

    return this.persistence.runWithEvents(async (tx, events) => {
      const created = await this.channelsRepo.insertChannel(tx, {
        name,
        serverId,
        sortOrder: dto.sort_order ?? 0,
        topic: normalizeNullableText(dto.topic),
        type: dto.type,
      });

      await this.channelsRepo.seedChannelReadStates(tx, created.id, serverId);

      const permissionOverwrites = await this.replacePermissionOverwrites(
        tx,
        created.id,
        serverId,
        overwrites,
      );

      events.audit({
        action: 'CreateChannel',
        actorId: user.userId,
        requestId,
        result: 'success',
        targetId: created.id,
        targetType: 'channel',
      });
      this.enqueueChannelChanged(events, created, 'created', permissionOverwrites, requestId);

      if (overwrites.length > 0) {
        await this.enqueuePermissionChanged(events, created, requestId);
      }

      return toChannelSummary(created, permissionOverwrites);
    });
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

    return this.persistence.runWithEvents(async (tx, events) => {
      const updated = await this.channelsRepo.updateChannel(tx, channelId, {
        name,
        sortOrder: dto.sort_order ?? current.sortOrder,
        topic: dto.topic !== undefined ? normalizeNullableText(dto.topic) : current.topic,
        type: dto.type ?? current.type,
      });
      const permissionOverwrites =
        overwrites === undefined
          ? await this.channelsRepo.listPermissionOverwrites(tx, channelId)
          : await this.replacePermissionOverwrites(tx, channelId, updated.serverId, overwrites);

      events.audit({
        action: 'UpdateChannel',
        actorId: user.userId,
        requestId,
        result: 'success',
        targetId: channelId,
        targetType: 'channel',
      });
      this.enqueueChannelChanged(events, updated, 'updated', permissionOverwrites, requestId);

      if (overwrites !== undefined) {
        await this.enqueuePermissionChanged(events, updated, requestId);
      }

      return toChannelSummary(updated, permissionOverwrites);
    });
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

    return this.persistence.runWithEvents(async (tx, events) => {
      const deleted = await this.channelsRepo.markChannelDeleted(tx, channelId);

      events.audit({
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
      this.enqueueChannelChanged(events, deleted, 'deleted', [], requestId);
      await this.enqueuePermissionChanged(events, deleted, requestId);

      return toChannelSummary({ ...deleted, serverId: current.serverId }, []);
    });
  }

  private async getActiveChannel(
    channelId: string,
    action: string,
    userId: string,
    requestId?: string,
  ): Promise<ChannelRow> {
    const channel = await this.channelsRepo.findActiveChannelForMember(channelId, userId);

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
    await this.channelsRepo.deletePermissionOverwrites(tx, channelId);

    for (const overwrite of overwrites) {
      await this.channelsRepo.insertPermissionOverwrite(tx, channelId, overwrite);
    }

    return this.channelsRepo.listPermissionOverwrites(tx, channelId);
  }

  private async validatePermissionOverwriteTargets(
    tx: RawSqlExecutor,
    serverId: string,
    overwrites: NormalizedPermissionOverwrite[],
  ): Promise<void> {
    for (const overwrite of overwrites) {
      if (overwrite.targetType === 'role') {
        const role = await this.channelsRepo.findRoleInServer(tx, overwrite.targetId, serverId);

        if (!role) {
          throw new AppError(
            ErrorCode.ResourceNotFound,
            'Permission overwrite role target was not found.',
            HttpStatus.NOT_FOUND,
          );
        }
      } else {
        const member = await this.channelsRepo.findActiveMembership(
          tx,
          overwrite.targetId,
          serverId,
        );

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

  private enqueueChannelChanged(
    events: EventCollector,
    channel: ChannelRow,
    changeType: 'created' | 'deleted' | 'updated',
    permissionOverwrites: PermissionOverwriteRow[],
    requestId?: string,
  ): void {
    events.publish(
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

  private async enqueuePermissionChanged(
    events: EventCollector,
    channel: ChannelRow,
    requestId?: string,
  ): Promise<void> {
    const [serverUsers, allowedUsers] = await Promise.all([
      this.channelsRepo.listServerActiveUserIds(channel.serverId),
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
      events.publish(
        buildUserRoom(userId),
        RealtimeEvent.PermissionChanged,
        {
          affected_user_ids: serverUsers,
          change_scope: 'channel',
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
        this.notificationsService.publishCreated(events, notifResult.notification, requestId);
      }
    }
  }

  private async recordFailure(
    action: string,
    actorId: string,
    targetId: string,
    failureReason: string,
    requestId?: string,
  ): Promise<void> {
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
