import { randomBytes } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';

import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { AppError } from '../../common/errors/app-error';
import type { EventCollector } from '../../common/persistence/event-collector';
import { PersistenceCoordinator } from '../../common/persistence/persistence-coordinator.service';
import { PrismaService } from '../../common/persistence/prisma.service';
import { PermissionAction } from '../../common/permissions/permission.types';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { buildRealtimeRoom, buildUserRoom } from '../realtime/realtime.rooms';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { VoiceService } from '../voice/voice.service';
import { AssignMemberRoleDto } from './dto/assign-member-role.dto';
import { CreateServerDto } from './dto/create-server.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { JoinServerDto } from './dto/join-server.dto';
import { ManageMemberDto } from './dto/manage-member.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import {
  ChannelRow,
  MemberSummary,
  MemberRow,
  ServerCreateResponse,
  ServerDetail,
  ServerRow,
  ServerSummary,
  toChannelSummary,
  toMemberSummary,
  toRoleSummary,
  toServerBaseSummary,
  toServerSummary,
} from './servers.presenter';
import { ServersRepository } from './servers.repository';

@Injectable()
export class ServersService {
  constructor(
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly permissionsService: PermissionsService,
    private readonly persistence: PersistenceCoordinator,
    private readonly prisma: PrismaService,
    private readonly realtimePublisher: RealtimePublisher,
    private readonly serversRepo: ServersRepository,
    private readonly voiceService: VoiceService,
  ) {}

  async createServer(
    user: AuthenticatedUserContext,
    dto: CreateServerDto,
    requestId?: string,
  ): Promise<ServerCreateResponse> {
    const name = dto.name.trim();

    if (name.length === 0) {
      await this.recordFailure('CreateServer', user.userId, 'empty_name', requestId);
      throw new AppError(
        ErrorCode.ValidationFailed,
        'Server name cannot be empty.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const iconAttachmentId = dto.icon_attachment_id ?? null;

    if (iconAttachmentId) {
      const attachment = await this.serversRepo.findReadyServerIconAttachment(
        iconAttachmentId,
        user.userId,
      );

      if (!attachment) {
        await this.recordFailure('CreateServer', user.userId, 'invalid_icon_attachment', requestId);
        throw new AppError(
          ErrorCode.ResourceNotFound,
          'Server icon attachment was not found.',
          HttpStatus.NOT_FOUND,
        );
      }
    }

    const description = normalizeNullableText(dto.description);
    const inviteCode = createInviteCode();

    return this.persistence.runWithEvents(async (tx, events) => {
      const server = await this.serversRepo.insertServer(tx, {
        description,
        iconAttachmentId,
        name,
        ownerId: user.userId,
      });
      const ownerMember = await this.serversRepo.insertOwnerMembership(tx, server.id, user.userId);
      const defaultRole = await this.serversRepo.insertDefaultRole(tx, server.id);

      await this.serversRepo.insertMembershipRole(
        tx,
        ownerMember.membershipId,
        defaultRole.id,
        user.userId,
      );

      const defaultChannel = await this.serversRepo.insertDefaultChannel(tx, server.id);

      await this.serversRepo.insertChannelReadState(tx, user.userId, defaultChannel.id);
      await this.serversRepo.insertInvitation(tx, {
        code: inviteCode,
        createdById: user.userId,
        serverId: server.id,
      });

      events.audit({
        action: 'CreateServer',
        actorId: user.userId,
        requestId,
        result: 'success',
        targetId: server.id,
        targetType: 'server',
      });
      events.publish(
        buildRealtimeRoom('server', server.id),
        RealtimeEvent.MemberJoined,
        {
          joined_at: ownerMember.joinedAt.toISOString(),
          member: toMemberSummaryWithRole(ownerMember, defaultRole.id),
          server_id: server.id,
        },
        requestId,
      );

      return {
        default_channel: toChannelSummary(defaultChannel),
        default_role: toRoleSummary(defaultRole),
        invite_code: inviteCode,
        owner_member: toMemberSummaryWithRole(ownerMember, defaultRole.id),
        server: toServerBaseSummary(server),
      };
    });
  }

  async listServers(user: AuthenticatedUserContext): Promise<ServerSummary[]> {
    const rows = await this.serversRepo.listMembershipServers(user.userId);

    return rows.map(toServerSummary);
  }

  async getServerDetail(user: AuthenticatedUserContext, serverId: string): Promise<ServerDetail> {
    const membership = await this.getActiveServerMembership(user.userId, serverId);
    const [channels, members, roles] = await Promise.all([
      this.listVisibleChannels(user, serverId),
      this.serversRepo.listServerMembersRows(serverId),
      this.serversRepo.listRoleRows(serverId),
    ]);

    return {
      ...toServerBaseSummary(membership),
      channels,
      current_member: toMemberSummary(membership),
      members: members.map(toMemberSummary),
      roles: roles.map(toRoleSummary),
    };
  }

  async joinServer(
    user: AuthenticatedUserContext,
    dto: JoinServerDto,
    requestId?: string,
  ): Promise<ServerDetail> {
    const serverId = await this.persistence.runWithEvents(async (tx, events) => {
      const invitation = await this.serversRepo.getInvitationForUpdate(tx, dto.invite_code);

      if (!invitation) {
        await this.recordFailure('JoinServer', user.userId, 'invalid_invite', requestId);
        throw new AppError(
          ErrorCode.ResourceNotFound,
          'Invite code was not found.',
          HttpStatus.NOT_FOUND,
        );
      }

      if (invitation.serverStatus !== 'active' || invitation.status !== 'active') {
        await this.recordFailure('JoinServer', user.userId, 'inactive_invite_or_server', requestId);
        throw new AppError(ErrorCode.Conflict, 'Invite is no longer active.', HttpStatus.CONFLICT);
      }

      if (invitation.expiresAt && invitation.expiresAt <= new Date()) {
        await this.recordFailure('JoinServer', user.userId, 'expired_invite', requestId);
        throw new AppError(ErrorCode.Conflict, 'Invite has expired.', HttpStatus.CONFLICT);
      }

      if (invitation.maxUses !== null && invitation.usedCount >= invitation.maxUses) {
        await this.recordFailure('JoinServer', user.userId, 'invite_use_limit_reached', requestId);
        throw new AppError(
          ErrorCode.Conflict,
          'Invite use limit has been reached.',
          HttpStatus.CONFLICT,
        );
      }

      const defaultRole = await this.serversRepo.getDefaultRole(tx, invitation.serverId);

      if (!defaultRole) {
        throw new AppError(
          ErrorCode.InternalError,
          'Default server role is missing.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const membership = await this.serversRepo.getMembershipForUpdate(
        tx,
        invitation.serverId,
        user.userId,
      );

      if (membership?.memberStatus === 'active' || membership?.memberStatus === 'muted') {
        await this.recordFailure('JoinServer', user.userId, 'already_member', requestId);
        throw new AppError(
          ErrorCode.Conflict,
          'User is already a member of this server.',
          HttpStatus.CONFLICT,
        );
      }

      if (membership?.memberStatus === 'banned') {
        await this.recordFailure('JoinServer', user.userId, 'member_banned', requestId);
        throw new AppError(
          ErrorCode.PermissionDenied,
          'User cannot join this server.',
          HttpStatus.FORBIDDEN,
        );
      }

      const member = membership
        ? await this.serversRepo.restoreMembership(tx, membership.id, user.userId)
        : await this.serversRepo.createMembership(tx, invitation.serverId, user.userId);

      await this.serversRepo.insertMembershipRoleIgnoreConflict(
        tx,
        member.id,
        defaultRole.id,
        user.userId,
      );
      await this.serversRepo.insertTextChannelReadStates(tx, user.userId, invitation.serverId);
      await this.serversRepo.incrementInvitationUseCount(tx, invitation.id);

      events.audit({
        action: 'JoinServer',
        actorId: user.userId,
        requestId,
        result: 'success',
        targetId: invitation.serverId,
        targetType: 'server',
      });

      return invitation.serverId;
    });

    const detail = await this.getServerDetail(user, serverId);

    return this.persistence.runWithEvents(async (_tx, events) => {
      events.publish(
        buildRealtimeRoom('server', serverId),
        RealtimeEvent.MemberJoined,
        {
          joined_at: detail.current_member.joined_at,
          member: detail.current_member,
          server_id: serverId,
        },
        requestId,
      );

      return detail;
    });
  }

  async leaveServer(
    user: AuthenticatedUserContext,
    serverId: string,
    requestId?: string,
  ): Promise<{ ok: true }> {
    return this.persistence.runWithEvents(async (tx, events) => {
      const membership = await this.serversRepo.getServerMembershipForUpdate(
        tx,
        serverId,
        user.userId,
      );

      if (!membership) {
        await this.recordFailure('LeaveServer', user.userId, 'not_member', requestId);
        throw new AppError(
          ErrorCode.ResourceNotFound,
          'Server membership was not found.',
          HttpStatus.NOT_FOUND,
        );
      }

      if (membership.ownerId === user.userId) {
        await this.recordFailure('LeaveServer', user.userId, 'owner_must_transfer', requestId);
        throw new AppError(
          ErrorCode.Conflict,
          'Server owner must transfer ownership before leaving.',
          HttpStatus.CONFLICT,
        );
      }

      await this.serversRepo.deleteAllMembershipRoles(tx, membership.membershipId);
      await this.serversRepo.markMembershipRemoved(tx, membership.membershipId);

      events.audit({
        action: 'LeaveServer',
        actorId: user.userId,
        requestId,
        result: 'success',
        targetId: serverId,
        targetType: 'server',
      });
      events.publish(
        buildRealtimeRoom('server', serverId),
        RealtimeEvent.MemberChanged,
        {
          change_type: 'left',
          member: { user_id: user.userId },
          membership_id: null,
          server_id: serverId,
        },
        requestId,
      );

      await this.voiceService.releaseUserActiveSessionForServer(
        serverId,
        user.userId,
        'server_left',
        requestId,
      );
      await this.forceMemberLeaveServerRooms(serverId, user.userId);

      return { ok: true };
    });
  }

  async listMembers(user: AuthenticatedUserContext, serverId: string): Promise<MemberSummary[]> {
    await this.getActiveServerMembership(user.userId, serverId);
    const rows = await this.serversRepo.listServerMembersRows(serverId);

    return rows.map(toMemberSummary);
  }

  async manageMember(
    user: AuthenticatedUserContext,
    serverId: string,
    membershipId: string,
    dto: ManageMemberDto,
    requestId?: string,
  ): Promise<MemberSummary> {
    const target = await this.permissionsService.assertCanManageMember(
      user,
      serverId,
      membershipId,
      requestId,
    );

    return this.persistence.runWithEvents(async (tx, events) => {
      if (dto.action === 'remove') {
        await this.serversRepo.deleteAllMembershipRoles(tx, membershipId);
      }

      if (dto.action === 'restore') {
        const defaultRole = await this.serversRepo.getDefaultRole(tx, serverId);

        if (!defaultRole) {
          throw new AppError(
            ErrorCode.InternalError,
            'Default server role is missing.',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }

        await this.serversRepo.insertMembershipRoleIgnoreConflict(
          tx,
          membershipId,
          defaultRole.id,
          user.userId,
        );
      }

      const nextStatus = dto.action === 'mute' ? 'muted' : dto.action === 'restore' ? 'active' : 'removed';
      const updated = await this.serversRepo.updateMembershipStatus(tx, serverId, membershipId, nextStatus);
      const refreshed = dto.action === 'remove'
        ? updated
        : await this.getMemberRowByIdOrThrow(serverId, membershipId);
      const summary = toMemberSummary(refreshed);

      events.audit({
        action: `ManageMember:${dto.action}`,
        actorId: user.userId,
        metadata: { reason: normalizeNullableText(dto.reason) },
        requestId,
        result: 'success',
        targetId: membershipId,
        targetType: 'membership',
      });
      this.enqueueMemberChanged(events, serverId, membershipId, `member_${dto.action}`, summary, requestId);
      await this.enqueuePermissionChanged(events, serverId, 'member', membershipId, [target.userId], requestId);

      if (dto.action === 'mute' || dto.action === 'remove') {
        const notifResult = await this.notificationsService.createNotification(tx, {
          contentPreview: dto.action === 'mute'
            ? 'You have been muted in a server'
            : 'You have been removed from a server',
          dedupeKey: `member:${membershipId}:${dto.action}`,
          sourceId: serverId,
          sourceType: 'server',
          type: 'PERMISSION_CHANGED',
          userId: target.userId,
        });
        if (notifResult.created) {
          this.notificationsService.publishCreated(events, notifResult.notification, requestId);
        }
      }

      if (dto.action === 'remove') {
        await this.voiceService.releaseUserActiveSessionForServer(
          serverId,
          target.userId,
          'member_removed',
          requestId,
        );
        await this.forceMemberLeaveServerRooms(serverId, target.userId);
      }

      return summary;
    });
  }

  async listRolesForUser(
    user: AuthenticatedUserContext,
    serverId: string,
  ): Promise<ReturnType<typeof toRoleSummary>[]> {
    await this.getActiveServerMembership(user.userId, serverId);

    return (await this.serversRepo.listRoleRows(serverId)).map(toRoleSummary);
  }

  async createRole(
    user: AuthenticatedUserContext,
    serverId: string,
    dto: CreateRoleDto,
    requestId?: string,
  ): Promise<ReturnType<typeof toRoleSummary>> {
    const name = dto.name.trim();
    const permissionBits = parsePermissionBits(dto.permission_bits);
    const priority = dto.priority ?? 0;

    if (name.length === 0) {
      throw new AppError(ErrorCode.ValidationFailed, 'Role name cannot be empty.', HttpStatus.BAD_REQUEST);
    }

    await this.permissionsService.assertCanMutateRole(
      user,
      serverId,
      { desiredPermissionBits: permissionBits, desiredPriority: priority },
      requestId,
    );

    return this.persistence.runWithEvents(async (tx, events) => {
      const role = await this.serversRepo.insertRole(tx, {
        color: normalizeNullableText(dto.color),
        name,
        permissionBits,
        priority,
        serverId,
      });

      this.enqueueRoleAudit(events, user.userId, 'CreateRole', role.id, requestId);
      const affectedUserIds = await this.serversRepo.listServerUserIds(serverId);

      await this.enqueuePermissionChanged(events, serverId, 'role', role.id, affectedUserIds, requestId);

      return toRoleSummary(role);
    });
  }

  async updateRole(
    user: AuthenticatedUserContext,
    roleId: string,
    dto: UpdateRoleDto,
    requestId?: string,
  ): Promise<ReturnType<typeof toRoleSummary>> {
    const existing = await this.serversRepo.getRoleRow(roleId);

    if (!existing) {
      throw new AppError(ErrorCode.ResourceNotFound, 'Role was not found.', HttpStatus.NOT_FOUND);
    }

    if (existing.isDefault && dto.priority !== undefined && dto.priority !== 0) {
      throw new AppError(
        ErrorCode.ValidationFailed,
        'Default role priority must remain 0.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const permissionBits =
      dto.permission_bits !== undefined ? parsePermissionBits(dto.permission_bits) : parsePermissionBits(existing.permissionBits);
    const priority = existing.isDefault ? 0 : dto.priority ?? existing.priority;
    const name = dto.name !== undefined ? dto.name.trim() : existing.name;

    if (name.length === 0) {
      throw new AppError(ErrorCode.ValidationFailed, 'Role name cannot be empty.', HttpStatus.BAD_REQUEST);
    }

    await this.permissionsService.assertCanMutateRole(
      user,
      existing.serverId,
      {
        desiredPermissionBits: permissionBits,
        desiredPriority: priority,
        targetRoleId: roleId,
      },
      requestId,
    );

    return this.persistence.runWithEvents(async (tx, events) => {
      const role = await this.serversRepo.updateRoleRow(tx, {
        color: dto.color !== undefined ? normalizeNullableText(dto.color) : existing.color,
        name,
        permissionBits,
        priority,
        roleId,
      });

      this.enqueueRoleAudit(events, user.userId, 'UpdateRole', role.id, requestId);
      const affectedUserIds = await this.serversRepo.listServerUserIds(role.serverId);

      await this.enqueuePermissionChanged(
        events,
        role.serverId,
        'role',
        role.id,
        affectedUserIds,
        requestId,
      );

      return toRoleSummary(role);
    });
  }

  async deleteRole(
    user: AuthenticatedUserContext,
    roleId: string,
    requestId?: string,
  ): Promise<{ ok: true }> {
    const existing = await this.serversRepo.getRoleRow(roleId);

    if (!existing) {
      throw new AppError(ErrorCode.ResourceNotFound, 'Role was not found.', HttpStatus.NOT_FOUND);
    }

    const target = await this.permissionsService.assertCanMutateRole(
      user,
      existing.serverId,
      { targetRoleId: roleId },
      requestId,
    );

    if (target?.isDefault) {
      throw new AppError(ErrorCode.Conflict, 'Default role cannot be deleted.', HttpStatus.CONFLICT);
    }

    return this.persistence.runWithEvents(async (tx, events) => {
      await this.serversRepo.deleteRoleRow(tx, roleId);
      this.enqueueRoleAudit(events, user.userId, 'DeleteRole', roleId, requestId);
      const affectedUserIds = await this.serversRepo.listServerUserIds(existing.serverId);

      await this.enqueuePermissionChanged(
        events,
        existing.serverId,
        'role',
        roleId,
        affectedUserIds,
        requestId,
      );

      return { ok: true };
    });
  }

  async assignRoleToMember(
    user: AuthenticatedUserContext,
    serverId: string,
    membershipId: string,
    dto: AssignMemberRoleDto,
    requestId?: string,
  ): Promise<MemberSummary> {
    await this.permissionsService.assertCanAssignRoleToMember(
      user,
      serverId,
      membershipId,
      dto.role_id,
      requestId,
    );

    return this.persistence.runWithEvents(async (tx, events) => {
      await this.serversRepo.insertMembershipRoleIgnoreConflict(
        tx,
        membershipId,
        dto.role_id,
        user.userId,
      );
      const member = await this.getMemberRowByIdOrThrow(serverId, membershipId);

      this.enqueueRoleAudit(events, user.userId, 'AssignRole', dto.role_id, requestId, membershipId);
      this.enqueueMemberChanged(events, serverId, membershipId, 'role_assigned', toMemberSummary(member), requestId);
      await this.enqueuePermissionChanged(events, serverId, 'member', membershipId, [member.userId], requestId);

      if (member.userId !== user.userId) {
        const notifResult = await this.notificationsService.createNotification(tx, {
          contentPreview: 'Your roles have been updated',
          dedupeKey: `role:${membershipId}:assign:${dto.role_id}`,
          sourceId: serverId,
          sourceType: 'server',
          type: 'PERMISSION_CHANGED',
          userId: member.userId,
        });
        if (notifResult.created) {
          this.notificationsService.publishCreated(events, notifResult.notification, requestId);
        }
      }

      return toMemberSummary(member);
    });
  }

  async removeRoleFromMember(
    user: AuthenticatedUserContext,
    serverId: string,
    membershipId: string,
    roleId: string,
    requestId?: string,
  ): Promise<MemberSummary> {
    const { role } = await this.permissionsService.assertCanAssignRoleToMember(
      user,
      serverId,
      membershipId,
      roleId,
      requestId,
    );

    if (role.isDefault) {
      throw new AppError(ErrorCode.Conflict, 'Default role cannot be removed from members.', HttpStatus.CONFLICT);
    }

    return this.persistence.runWithEvents(async (tx, events) => {
      await this.serversRepo.deleteMembershipRole(tx, membershipId, roleId);
      const member = await this.getMemberRowByIdOrThrow(serverId, membershipId);

      this.enqueueRoleAudit(events, user.userId, 'RemoveRole', roleId, requestId, membershipId);
      this.enqueueMemberChanged(events, serverId, membershipId, 'role_removed', toMemberSummary(member), requestId);
      await this.enqueuePermissionChanged(events, serverId, 'member', membershipId, [member.userId], requestId);

      if (member.userId !== user.userId) {
        const notifResult = await this.notificationsService.createNotification(tx, {
          contentPreview: 'Your roles have been updated',
          dedupeKey: `role:${membershipId}:remove:${roleId}`,
          sourceId: serverId,
          sourceType: 'server',
          type: 'PERMISSION_CHANGED',
          userId: member.userId,
        });
        if (notifResult.created) {
          this.notificationsService.publishCreated(events, notifResult.notification, requestId);
        }
      }

      return toMemberSummary(member);
    });
  }

  private async getActiveServerMembership(
    userId: string,
    serverId: string,
  ): Promise<ServerRow & MemberRow> {
    const membership = await this.serversRepo.getActiveServerMembership(userId, serverId);

    if (!membership) {
      throw new AppError(
        ErrorCode.PermissionDenied,
        'Server membership is required.',
        HttpStatus.FORBIDDEN,
      );
    }

    return membership;
  }

  private async listVisibleChannels(
    user: AuthenticatedUserContext,
    serverId: string,
  ): Promise<ReturnType<typeof toChannelSummary>[]> {
    const rows = await this.serversRepo.listActiveChannelsByServer(serverId);
    const visibleChannels: ChannelRow[] = [];

    for (const channel of rows) {
      const decision = await this.permissionsService.checkAllowed({
        action: PermissionAction.ViewChannel,
        resource: { id: channel.id, type: channel.type === 'voice' ? 'voice' : 'channel' },
        user,
      });

      if (decision.allowed) {
        visibleChannels.push(channel);
      }
    }

    const overwrites = await this.serversRepo.listPermissionOverwritesForChannels(
      visibleChannels.map((row) => row.id),
    );

    return visibleChannels.map((channel) =>
      toChannelSummary(
        channel,
        overwrites.filter((overwrite) => overwrite.channelId === channel.id),
      ),
    );
  }

  private async getMemberRowByIdOrThrow(
    serverId: string,
    membershipId: string,
  ): Promise<MemberRow> {
    const member = await this.serversRepo.getMemberRowById(serverId, membershipId);

    if (!member) {
      throw new AppError(ErrorCode.ResourceNotFound, 'Server member was not found.', HttpStatus.NOT_FOUND);
    }

    return member;
  }

  private enqueueRoleAudit(
    events: EventCollector,
    actorId: string,
    action: string,
    roleId: string,
    requestId?: string,
    membershipId?: string,
  ): void {
    events.audit({
      action,
      actorId,
      metadata: membershipId ? { membership_id: membershipId } : undefined,
      requestId,
      result: 'success',
      targetId: roleId,
      targetType: 'role',
    });
  }

  private enqueueMemberChanged(
    events: EventCollector,
    serverId: string,
    membershipId: string,
    changeType: string,
    member: MemberSummary,
    requestId?: string,
  ): void {
    events.publish(
      buildRealtimeRoom('server', serverId),
      RealtimeEvent.MemberChanged,
      {
        change_type: changeType,
        member,
        membership_id: membershipId,
        server_id: serverId,
      },
      requestId,
    );
  }

  private async enqueuePermissionChanged(
    events: EventCollector,
    serverId: string,
    changeScope: 'member' | 'role',
    resourceId: string,
    affectedUserIds: string[],
    requestId?: string,
  ): Promise<void> {
    const payload = {
      affected_user_ids: affectedUserIds,
      change_scope: changeScope,
      resource_id: resourceId,
      server_id: serverId,
    };

    events.publish(
      buildRealtimeRoom('server', serverId),
      RealtimeEvent.PermissionChanged,
      payload,
      requestId,
    );

    for (const userId of affectedUserIds) {
      events.publish(
        buildUserRoom(userId),
        RealtimeEvent.PermissionChanged,
        payload,
        requestId,
      );
    }

    await this.voiceService.releaseUsersActiveSessionsWithoutJoinPermission(
      serverId,
      affectedUserIds,
      'permission_removed',
      requestId,
    );
  }

  private async forceMemberLeaveServerRooms(serverId: string, userId: string): Promise<void> {
    const channels = await this.serversRepo.listServerChannels(serverId);
    const rooms = [
      buildRealtimeRoom('server', serverId),
      ...channels.map((channel) => buildRealtimeRoom('channel', channel.id)),
      ...channels
        .filter((channel) => channel.type === 'voice')
        .map((channel) => buildRealtimeRoom('voice', channel.id)),
    ];

    this.realtimePublisher.leaveUserRooms([userId], rooms);
  }

  private async recordFailure(
    action: string,
    actorId: string,
    failureReason: string,
    requestId?: string,
  ): Promise<void> {
    await this.auditService.record({
      action,
      actorId,
      failureReason,
      requestId,
      result: 'failure',
      targetType: 'server',
    });
  }
}

function createInviteCode(): string {
  return randomBytes(6).toString('base64url');
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function parsePermissionBits(value: bigint | number | string): bigint {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    return BigInt(value);
  }

  if (!/^\d+$/.test(value)) {
    throw new AppError(
      ErrorCode.ValidationFailed,
      'Permission bits must be a non-negative integer string.',
      HttpStatus.BAD_REQUEST,
    );
  }

  return BigInt(value);
}

function toMemberSummaryWithRole(
  row: MemberRow,
  roleId: string,
): ReturnType<typeof toMemberSummary> {
  return toMemberSummary({ ...row, roleIds: [roleId] });
}
