import { randomBytes, randomUUID } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';

import { DEFAULT_MEMBER_PERMISSION_BITS, ErrorCode, RealtimeEvent } from '@eiscord/shared';

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
  PermissionOverwriteRow,
  RoleRow,
  ServerCreateResponse,
  ServerDetail,
  ServerListRow,
  ServerRow,
  ServerSummary,
  toChannelSummary,
  toMemberSummary,
  toRoleSummary,
  toServerBaseSummary,
  toServerSummary,
} from './servers.presenter';

type AttachmentLookupRow = {
  id: string;
};

type InvitationRow = {
  code: string;
  expiresAt: Date | null;
  id: string;
  maxUses: number | null;
  serverId: string;
  serverStatus: string;
  status: string;
  usedCount: number;
};

type MembershipLookupRow = {
  id: string;
  memberStatus: string;
  serverId: string;
  userId: string;
};

type ServerMembershipRow = ServerRow & {
  membershipId: string;
  membershipStatus: string;
};

type RawSqlExecutor = Pick<PrismaService, '$executeRaw' | '$queryRaw'>;

type ServerUserRow = {
  userId: string;
};

@Injectable()
export class ServersService {
  constructor(
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly permissionsService: PermissionsService,
    private readonly prisma: PrismaService,
    private readonly realtimePublisher: RealtimePublisher,
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
      const [attachment] = await this.prisma.$queryRaw<AttachmentLookupRow[]>`
        SELECT id
        FROM attachments
        WHERE id = ${iconAttachmentId}::uuid
          AND owner_id = ${user.userId}::uuid
          AND purpose = 'server_icon'
          AND status = 'ready'
        LIMIT 1
      `;

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
    const result = await this.prisma.$transaction(async (tx) => {
      const [server] = await tx.$queryRaw<ServerRow[]>`
        INSERT INTO servers (id, owner_id, name, icon_attachment_id, description, status)
        VALUES (
          ${randomUUID()}::uuid,
          ${user.userId}::uuid,
          ${name},
          ${iconAttachmentId}::uuid,
          ${description},
          'active'
        )
        RETURNING
          id,
          owner_id AS "ownerId",
          name,
          icon_attachment_id AS "iconAttachmentId",
          description,
          status,
          created_at AS "createdAt"
      `;

      const [ownerMember] = await tx.$queryRaw<MemberRow[]>`
        INSERT INTO memberships (id, server_id, user_id, nick_in_server, member_status)
        SELECT
          ${randomUUID()}::uuid,
          ${server.id}::uuid,
          ${user.userId}::uuid,
          u.nickname,
          'active'
        FROM users u
        WHERE u.id = ${user.userId}::uuid
        RETURNING
          id AS "membershipId",
          server_id AS "serverId",
          user_id AS "userId",
          nick_in_server AS "nickInServer",
          member_status AS "memberStatus",
          joined_at AS "joinedAt",
          ARRAY[]::text[] AS "roleIds",
          (SELECT username FROM users WHERE id = ${user.userId}::uuid) AS "username",
          (SELECT nickname FROM users WHERE id = ${user.userId}::uuid) AS "userNickname",
          (SELECT avatar_attachment_id FROM users WHERE id = ${user.userId}::uuid) AS "avatarAttachmentId",
          (SELECT presence_status FROM users WHERE id = ${user.userId}::uuid) AS "presenceStatus"
      `;

      const [defaultRole] = await tx.$queryRaw<RoleRow[]>`
        INSERT INTO roles (id, server_id, name, permission_bits, color, priority, is_default)
        VALUES (
          ${randomUUID()}::uuid,
          ${server.id}::uuid,
          'Member',
          ${BigInt(DEFAULT_MEMBER_PERMISSION_BITS)},
          null,
          0,
          true
        )
        RETURNING
          id,
          server_id AS "serverId",
          name,
          permission_bits AS "permissionBits",
          color,
          priority,
          is_default AS "isDefault"
      `;

      await tx.$executeRaw`
        INSERT INTO membership_roles (membership_id, role_id, assigned_by_id)
        VALUES (${ownerMember.membershipId}::uuid, ${defaultRole.id}::uuid, ${user.userId}::uuid)
      `;

      const [defaultChannel] = await tx.$queryRaw<ChannelRow[]>`
        INSERT INTO channels (id, server_id, name, type, topic, sort_order, status)
        VALUES (${randomUUID()}::uuid, ${server.id}::uuid, 'general', 'text', null, 0, 'active')
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
        VALUES (
          gen_random_uuid(),
          ${user.userId}::uuid,
          'channel',
          ${defaultChannel.id}::uuid,
          null,
          0
        )
        ON CONFLICT (user_id, channel_id) DO NOTHING
      `;

      await tx.$executeRaw`
        INSERT INTO invitations (id, server_id, code, created_by_id, expires_at, max_uses, used_count, status)
        VALUES (
          ${randomUUID()}::uuid,
          ${server.id}::uuid,
          ${inviteCode},
          ${user.userId}::uuid,
          null,
          null,
          0,
          'active'
        )
      `;

      return { defaultChannel, defaultRole, ownerMember, server };
    });

    await this.auditService.record({
      action: 'CreateServer',
      actorId: user.userId,
      requestId,
      result: 'success',
      targetId: result.server.id,
      targetType: 'server',
    });

    this.realtimePublisher.publishToRoom(
      buildRealtimeRoom('server', result.server.id),
      RealtimeEvent.MemberJoined,
      {
        joined_at: result.ownerMember.joinedAt.toISOString(),
        member: toMemberSummaryWithRole(result.ownerMember, result.defaultRole.id),
        server_id: result.server.id,
      },
      requestId,
    );

    return {
      default_channel: toChannelSummary(result.defaultChannel),
      default_role: toRoleSummary(result.defaultRole),
      invite_code: inviteCode,
      owner_member: toMemberSummaryWithRole(result.ownerMember, result.defaultRole.id),
      server: toServerBaseSummary(result.server),
    };
  }

  async listServers(user: AuthenticatedUserContext): Promise<ServerSummary[]> {
    const rows = await this.prisma.$queryRaw<ServerListRow[]>`
      SELECT
        s.id,
        s.owner_id AS "ownerId",
        s.name,
        s.icon_attachment_id AS "iconAttachmentId",
        s.description,
        s.status,
        s.created_at AS "createdAt",
        m.joined_at AS "joinedAt",
        m.member_status AS "memberStatus"
      FROM memberships m
      INNER JOIN servers s ON s.id = m.server_id
      WHERE m.user_id = ${user.userId}::uuid
        AND m.member_status IN ('active', 'muted')
        AND s.status = 'active'
      ORDER BY m.joined_at DESC
    `;

    return rows.map(toServerSummary);
  }

  async getServerDetail(user: AuthenticatedUserContext, serverId: string): Promise<ServerDetail> {
    const membership = await this.getActiveServerMembership(user.userId, serverId);
    const [channels, members, roles] = await Promise.all([
      this.listVisibleChannels(user, serverId),
      this.listServerMembersRows(serverId),
      this.listRoleRows(serverId),
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
    const serverId = await this.prisma.$transaction(async (tx) => {
      const invitation = await this.getInvitationForUpdate(tx, dto.invite_code);

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

      const defaultRole = await this.getDefaultRole(tx, invitation.serverId);
      const membership = await this.getMembershipForUpdate(tx, invitation.serverId, user.userId);

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
        ? await this.restoreMembership(tx, membership.id, user.userId)
        : await this.createMembership(tx, invitation.serverId, user.userId);

      await tx.$executeRaw`
        INSERT INTO membership_roles (membership_id, role_id, assigned_by_id)
        VALUES (${member.id}::uuid, ${defaultRole.id}::uuid, ${user.userId}::uuid)
        ON CONFLICT (membership_id, role_id) DO NOTHING
      `;

      await tx.$executeRaw`
        INSERT INTO read_states (id, user_id, scope_type, channel_id, last_read_message_id, unread_count)
        SELECT gen_random_uuid(), ${user.userId}::uuid, 'channel', c.id, null, 0
        FROM channels c
        WHERE c.server_id = ${invitation.serverId}::uuid
          AND c.type = 'text'
          AND c.status = 'active'
        ON CONFLICT (user_id, channel_id) DO NOTHING
      `;

      await tx.$executeRaw`
        UPDATE invitations
        SET used_count = used_count + 1, updated_at = NOW()
        WHERE id = ${invitation.id}::uuid
      `;

      return invitation.serverId;
    });

    await this.auditService.record({
      action: 'JoinServer',
      actorId: user.userId,
      requestId,
      result: 'success',
      targetId: serverId,
      targetType: 'server',
    });

    const detail = await this.getServerDetail(user, serverId);
    this.realtimePublisher.publishToRoom(
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
  }

  async leaveServer(
    user: AuthenticatedUserContext,
    serverId: string,
    requestId?: string,
  ): Promise<{ ok: true }> {
    await this.prisma.$transaction(async (tx) => {
      const membership = await this.getServerMembershipForUpdate(tx, serverId, user.userId);

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

      await tx.$executeRaw`
        DELETE FROM membership_roles
        WHERE membership_id = ${membership.membershipId}::uuid
      `;

      await tx.$executeRaw`
        UPDATE memberships
        SET member_status = 'removed', updated_at = NOW()
        WHERE id = ${membership.membershipId}::uuid
      `;
    });

    await this.auditService.record({
      action: 'LeaveServer',
      actorId: user.userId,
      requestId,
      result: 'success',
      targetId: serverId,
      targetType: 'server',
    });

    this.realtimePublisher.publishToRoom(
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
  }

  async listMembers(user: AuthenticatedUserContext, serverId: string): Promise<MemberSummary[]> {
    await this.getActiveServerMembership(user.userId, serverId);
    const rows = await this.listServerMembersRows(serverId);

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
    const member = await this.prisma.$transaction(async (tx) => {
      if (dto.action === 'remove') {
        await tx.$executeRaw`
          DELETE FROM membership_roles
          WHERE membership_id = ${membershipId}::uuid
        `;
      }

      if (dto.action === 'restore') {
        const defaultRole = await this.getDefaultRole(tx, serverId);

        await tx.$executeRaw`
          INSERT INTO membership_roles (membership_id, role_id, assigned_by_id)
          VALUES (${membershipId}::uuid, ${defaultRole.id}::uuid, ${user.userId}::uuid)
          ON CONFLICT (membership_id, role_id) DO NOTHING
        `;
      }

      const nextStatus = dto.action === 'mute' ? 'muted' : dto.action === 'restore' ? 'active' : 'removed';
      const [updated] = await tx.$queryRaw<MemberRow[]>`
        UPDATE memberships
        SET member_status = ${nextStatus}, updated_at = NOW()
        WHERE id = ${membershipId}::uuid
          AND server_id = ${serverId}::uuid
        RETURNING
          id AS "membershipId",
          server_id AS "serverId",
          user_id AS "userId",
          nick_in_server AS "nickInServer",
          member_status AS "memberStatus",
          joined_at AS "joinedAt",
          ARRAY[]::text[] AS "roleIds",
          (SELECT username FROM users WHERE id = memberships.user_id) AS "username",
          (SELECT nickname FROM users WHERE id = memberships.user_id) AS "userNickname",
          (SELECT avatar_attachment_id FROM users WHERE id = memberships.user_id) AS "avatarAttachmentId",
          (SELECT presence_status FROM users WHERE id = memberships.user_id) AS "presenceStatus"
      `;

      return updated;
    });
    const refreshed = dto.action === 'remove'
      ? member
      : await this.getMemberRowById(serverId, membershipId);
    const summary = toMemberSummary(refreshed);

    await this.auditService.record({
      action: `ManageMember:${dto.action}`,
      actorId: user.userId,
      metadata: { reason: normalizeNullableText(dto.reason) },
      requestId,
      result: 'success',
      targetId: membershipId,
      targetType: 'membership',
    });

    this.publishMemberChanged(serverId, membershipId, `member_${dto.action}`, summary, requestId);
    await this.publishPermissionChanged(serverId, 'member', membershipId, [target.userId], requestId);

    if (dto.action === 'mute' || dto.action === 'remove') {
      const notifResult = await this.notificationsService.createNotification(this.prisma, {
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
        this.notificationsService.publishCreated(notifResult.notification, requestId);
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
  }

  async listRolesForUser(
    user: AuthenticatedUserContext,
    serverId: string,
  ): Promise<ReturnType<typeof toRoleSummary>[]> {
    await this.getActiveServerMembership(user.userId, serverId);

    return (await this.listRoleRows(serverId)).map(toRoleSummary);
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
    const [role] = await this.prisma.$queryRaw<RoleRow[]>`
      INSERT INTO roles (id, server_id, name, permission_bits, color, priority, is_default)
      VALUES (
        ${randomUUID()}::uuid,
        ${serverId}::uuid,
        ${name},
        ${permissionBits},
        ${normalizeNullableText(dto.color)},
        ${priority},
        false
      )
      RETURNING
        id,
        server_id AS "serverId",
        name,
        permission_bits AS "permissionBits",
        color,
        priority,
        is_default AS "isDefault"
    `;

    await this.auditRoleChange(user.userId, 'CreateRole', role.id, requestId);
    await this.publishPermissionChanged(serverId, 'role', role.id, await this.listServerUserIds(serverId), requestId);

    return toRoleSummary(role);
  }

  async updateRole(
    user: AuthenticatedUserContext,
    roleId: string,
    dto: UpdateRoleDto,
    requestId?: string,
  ): Promise<ReturnType<typeof toRoleSummary>> {
    const existing = await this.getRoleRow(roleId);

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
    const [role] = await this.prisma.$queryRaw<RoleRow[]>`
      UPDATE roles
      SET
        name = ${name},
        permission_bits = ${permissionBits},
        color = ${dto.color !== undefined ? normalizeNullableText(dto.color) : existing.color},
        priority = ${priority},
        updated_at = NOW()
      WHERE id = ${roleId}::uuid
      RETURNING
        id,
        server_id AS "serverId",
        name,
        permission_bits AS "permissionBits",
        color,
        priority,
        is_default AS "isDefault"
    `;

    await this.auditRoleChange(user.userId, 'UpdateRole', role.id, requestId);
    await this.publishPermissionChanged(
      role.serverId,
      'role',
      role.id,
      await this.listServerUserIds(role.serverId),
      requestId,
    );

    return toRoleSummary(role);
  }

  async deleteRole(
    user: AuthenticatedUserContext,
    roleId: string,
    requestId?: string,
  ): Promise<{ ok: true }> {
    const existing = await this.getRoleRow(roleId);

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

    await this.prisma.$executeRaw`
      DELETE FROM roles
      WHERE id = ${roleId}::uuid
    `;
    await this.auditRoleChange(user.userId, 'DeleteRole', roleId, requestId);
    await this.publishPermissionChanged(
      existing.serverId,
      'role',
      roleId,
      await this.listServerUserIds(existing.serverId),
      requestId,
    );

    return { ok: true };
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
    await this.prisma.$executeRaw`
      INSERT INTO membership_roles (membership_id, role_id, assigned_by_id)
      VALUES (${membershipId}::uuid, ${dto.role_id}::uuid, ${user.userId}::uuid)
      ON CONFLICT (membership_id, role_id) DO NOTHING
    `;
    const member = await this.getMemberRowById(serverId, membershipId);

    await this.auditRoleChange(user.userId, 'AssignRole', dto.role_id, requestId, membershipId);
    this.publishMemberChanged(serverId, membershipId, 'role_assigned', toMemberSummary(member), requestId);
    await this.publishPermissionChanged(serverId, 'member', membershipId, [member.userId], requestId);

    if (member.userId !== user.userId) {
      const notifResult = await this.notificationsService.createNotification(this.prisma, {
        contentPreview: 'Your roles have been updated',
        dedupeKey: `role:${membershipId}:assign:${dto.role_id}`,
        sourceId: serverId,
        sourceType: 'server',
        type: 'PERMISSION_CHANGED',
        userId: member.userId,
      });
      if (notifResult.created) {
        this.notificationsService.publishCreated(notifResult.notification, requestId);
      }
    }

    return toMemberSummary(member);
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

    await this.prisma.$executeRaw`
      DELETE FROM membership_roles
      WHERE membership_id = ${membershipId}::uuid
        AND role_id = ${roleId}::uuid
    `;
    const member = await this.getMemberRowById(serverId, membershipId);

    await this.auditRoleChange(user.userId, 'RemoveRole', roleId, requestId, membershipId);
    this.publishMemberChanged(serverId, membershipId, 'role_removed', toMemberSummary(member), requestId);
    await this.publishPermissionChanged(serverId, 'member', membershipId, [member.userId], requestId);

    if (member.userId !== user.userId) {
      const notifResult = await this.notificationsService.createNotification(this.prisma, {
        contentPreview: 'Your roles have been updated',
        dedupeKey: `role:${membershipId}:remove:${roleId}`,
        sourceId: serverId,
        sourceType: 'server',
        type: 'PERMISSION_CHANGED',
        userId: member.userId,
      });
      if (notifResult.created) {
        this.notificationsService.publishCreated(notifResult.notification, requestId);
      }
    }

    return toMemberSummary(member);
  }

  private async getInvitationForUpdate(
    tx: RawSqlExecutor,
    inviteCode: string,
  ): Promise<InvitationRow | null> {
    const [invitation] = await tx.$queryRaw<InvitationRow[]>`
      SELECT
        i.id,
        i.server_id AS "serverId",
        i.code,
        i.expires_at AS "expiresAt",
        i.max_uses AS "maxUses",
        i.used_count AS "usedCount",
        i.status,
        s.status AS "serverStatus"
      FROM invitations i
      INNER JOIN servers s ON s.id = i.server_id
      WHERE i.code = ${inviteCode}
      LIMIT 1
      FOR UPDATE OF i
    `;

    return invitation ?? null;
  }

  private async getDefaultRole(tx: RawSqlExecutor, serverId: string): Promise<RoleRow> {
    const [role] = await tx.$queryRaw<RoleRow[]>`
      SELECT
        id,
        server_id AS "serverId",
        name,
        permission_bits AS "permissionBits",
        color,
        priority,
        is_default AS "isDefault"
      FROM roles
      WHERE server_id = ${serverId}::uuid
        AND is_default = true
      LIMIT 1
    `;

    if (!role) {
      throw new AppError(
        ErrorCode.InternalError,
        'Default server role is missing.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    return role;
  }

  private async getMembershipForUpdate(
    tx: RawSqlExecutor,
    serverId: string,
    userId: string,
  ): Promise<MembershipLookupRow | null> {
    const [membership] = await tx.$queryRaw<MembershipLookupRow[]>`
      SELECT
        id,
        server_id AS "serverId",
        user_id AS "userId",
        member_status AS "memberStatus"
      FROM memberships
      WHERE server_id = ${serverId}::uuid
        AND user_id = ${userId}::uuid
      LIMIT 1
      FOR UPDATE
    `;

    return membership ?? null;
  }

  private async createMembership(
    tx: RawSqlExecutor,
    serverId: string,
    userId: string,
  ): Promise<MembershipLookupRow> {
    const [membership] = await tx.$queryRaw<MembershipLookupRow[]>`
      INSERT INTO memberships (id, server_id, user_id, nick_in_server, member_status)
      SELECT
        ${randomUUID()}::uuid,
        ${serverId}::uuid,
        ${userId}::uuid,
        u.nickname,
        'active'
      FROM users u
      WHERE u.id = ${userId}::uuid
      RETURNING
        id,
        server_id AS "serverId",
        user_id AS "userId",
        member_status AS "memberStatus"
    `;

    return membership;
  }

  private async restoreMembership(
    tx: RawSqlExecutor,
    membershipId: string,
    userId: string,
  ): Promise<MembershipLookupRow> {
    const [membership] = await tx.$queryRaw<MembershipLookupRow[]>`
      UPDATE memberships
      SET
        member_status = 'active',
        nick_in_server = (SELECT nickname FROM users WHERE id = ${userId}::uuid),
        joined_at = NOW(),
        updated_at = NOW()
      WHERE id = ${membershipId}::uuid
      RETURNING
        id,
        server_id AS "serverId",
        user_id AS "userId",
        member_status AS "memberStatus"
    `;

    return membership;
  }

  private async getServerMembershipForUpdate(
    tx: RawSqlExecutor,
    serverId: string,
    userId: string,
  ): Promise<ServerMembershipRow | null> {
    const [membership] = await tx.$queryRaw<ServerMembershipRow[]>`
      SELECT
        s.id,
        s.owner_id AS "ownerId",
        s.name,
        s.icon_attachment_id AS "iconAttachmentId",
        s.description,
        s.status,
        s.created_at AS "createdAt",
        m.id AS "membershipId",
        m.member_status AS "membershipStatus"
      FROM memberships m
      INNER JOIN servers s ON s.id = m.server_id
      WHERE m.server_id = ${serverId}::uuid
        AND m.user_id = ${userId}::uuid
        AND m.member_status IN ('active', 'muted')
        AND s.status = 'active'
      LIMIT 1
      FOR UPDATE OF m
    `;

    return membership ?? null;
  }

  private async getActiveServerMembership(
    userId: string,
    serverId: string,
  ): Promise<ServerRow & MemberRow> {
    const [membership] = await this.prisma.$queryRaw<Array<ServerRow & MemberRow>>`
      SELECT
        s.id,
        s.owner_id AS "ownerId",
        s.name,
        s.icon_attachment_id AS "iconAttachmentId",
        s.description,
        s.status,
        s.created_at AS "createdAt",
        m.id AS "membershipId",
        m.server_id AS "serverId",
        m.user_id AS "userId",
        m.nick_in_server AS "nickInServer",
        m.member_status AS "memberStatus",
        m.joined_at AS "joinedAt",
        COALESCE(array_agg(mr.role_id::text) FILTER (WHERE mr.role_id IS NOT NULL), ARRAY[]::text[]) AS "roleIds",
        u.username,
        u.nickname AS "userNickname",
        u.avatar_attachment_id AS "avatarAttachmentId",
        u.presence_status AS "presenceStatus"
      FROM memberships m
      INNER JOIN servers s ON s.id = m.server_id
      INNER JOIN users u ON u.id = m.user_id
      LEFT JOIN membership_roles mr ON mr.membership_id = m.id
      WHERE m.server_id = ${serverId}::uuid
        AND m.user_id = ${userId}::uuid
        AND m.member_status IN ('active', 'muted')
        AND s.status = 'active'
      GROUP BY s.id, m.id, u.id
      LIMIT 1
    `;

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
    const rows = await this.prisma.$queryRaw<ChannelRow[]>`
      SELECT
        id,
        server_id AS "serverId",
        name,
        type,
        topic,
        sort_order AS "sortOrder",
        status,
        created_at AS "createdAt"
      FROM channels
      WHERE server_id = ${serverId}::uuid
        AND status = 'active'
      ORDER BY sort_order ASC, created_at ASC
    `;
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

    const overwrites = await this.listPermissionOverwritesForChannels(visibleChannels.map((row) => row.id));

    return visibleChannels.map((channel) =>
      toChannelSummary(
        channel,
        overwrites.filter((overwrite) => overwrite.channelId === channel.id),
      ),
    );
  }

  private async listRoleRows(serverId: string): Promise<RoleRow[]> {
    return this.prisma.$queryRaw<RoleRow[]>`
      SELECT
        id,
        server_id AS "serverId",
        name,
        permission_bits AS "permissionBits",
        color,
        priority,
        is_default AS "isDefault"
      FROM roles
      WHERE server_id = ${serverId}::uuid
      ORDER BY priority DESC, created_at ASC
    `;
  }

  private async listPermissionOverwritesForChannels(
    channelIds: string[],
  ): Promise<PermissionOverwriteRow[]> {
    if (channelIds.length === 0) {
      return [];
    }

    return this.prisma.$queryRaw<PermissionOverwriteRow[]>`
      SELECT
        id,
        channel_id AS "channelId",
        target_type AS "targetType",
        target_id AS "targetId",
        allow_bits AS "allowBits",
        deny_bits AS "denyBits"
      FROM permission_overwrites
      WHERE channel_id = ANY(${channelIds}::uuid[])
      ORDER BY target_type ASC, created_at ASC
    `;
  }

  private async listServerMembersRows(serverId: string): Promise<MemberRow[]> {
    return this.prisma.$queryRaw<MemberRow[]>`
      SELECT
        m.id AS "membershipId",
        m.server_id AS "serverId",
        m.user_id AS "userId",
        m.nick_in_server AS "nickInServer",
        m.member_status AS "memberStatus",
        m.joined_at AS "joinedAt",
        COALESCE(array_agg(mr.role_id::text) FILTER (WHERE mr.role_id IS NOT NULL), ARRAY[]::text[]) AS "roleIds",
        u.username,
        u.nickname AS "userNickname",
        u.avatar_attachment_id AS "avatarAttachmentId",
        u.presence_status AS "presenceStatus"
      FROM memberships m
      INNER JOIN users u ON u.id = m.user_id
      LEFT JOIN membership_roles mr ON mr.membership_id = m.id
      WHERE m.server_id = ${serverId}::uuid
        AND m.member_status IN ('active', 'muted')
      GROUP BY m.id, u.id
      ORDER BY m.joined_at ASC
    `;
  }

  private async getMemberRowById(serverId: string, membershipId: string): Promise<MemberRow> {
    const [member] = await this.prisma.$queryRaw<MemberRow[]>`
      SELECT
        m.id AS "membershipId",
        m.server_id AS "serverId",
        m.user_id AS "userId",
        m.nick_in_server AS "nickInServer",
        m.member_status AS "memberStatus",
        m.joined_at AS "joinedAt",
        COALESCE(array_agg(mr.role_id::text) FILTER (WHERE mr.role_id IS NOT NULL), ARRAY[]::text[]) AS "roleIds",
        u.username,
        u.nickname AS "userNickname",
        u.avatar_attachment_id AS "avatarAttachmentId",
        u.presence_status AS "presenceStatus"
      FROM memberships m
      INNER JOIN users u ON u.id = m.user_id
      LEFT JOIN membership_roles mr ON mr.membership_id = m.id
      WHERE m.server_id = ${serverId}::uuid
        AND m.id = ${membershipId}::uuid
      GROUP BY m.id, u.id
      LIMIT 1
    `;

    if (!member) {
      throw new AppError(ErrorCode.ResourceNotFound, 'Server member was not found.', HttpStatus.NOT_FOUND);
    }

    return member;
  }

  private async getRoleRow(roleId: string): Promise<RoleRow | null> {
    const [role] = await this.prisma.$queryRaw<RoleRow[]>`
      SELECT
        id,
        server_id AS "serverId",
        name,
        permission_bits AS "permissionBits",
        color,
        priority,
        is_default AS "isDefault"
      FROM roles
      WHERE id = ${roleId}::uuid
      LIMIT 1
    `;

    return role ?? null;
  }

  private async auditRoleChange(
    actorId: string,
    action: string,
    roleId: string,
    requestId?: string,
    membershipId?: string,
  ): Promise<void> {
    await this.auditService.record({
      action,
      actorId,
      metadata: membershipId ? { membership_id: membershipId } : undefined,
      requestId,
      result: 'success',
      targetId: roleId,
      targetType: 'role',
    });
  }

  private publishMemberChanged(
    serverId: string,
    membershipId: string,
    changeType: string,
    member: MemberSummary,
    requestId?: string,
  ): void {
    this.realtimePublisher.publishToRoom(
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

  private async publishPermissionChanged(
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

    this.realtimePublisher.publishToRoom(
      buildRealtimeRoom('server', serverId),
      RealtimeEvent.PermissionChanged,
      payload,
      requestId,
    );

    for (const userId of affectedUserIds) {
      this.realtimePublisher.publishToRoom(
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

  private async listServerUserIds(serverId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<ServerUserRow[]>`
      SELECT user_id AS "userId"
      FROM memberships
      WHERE server_id = ${serverId}::uuid
        AND member_status IN ('active', 'muted')
    `;

    return rows.map((row) => row.userId);
  }

  private async forceMemberLeaveServerRooms(serverId: string, userId: string): Promise<void> {
    const channels = await this.prisma.$queryRaw<Array<{ id: string; type: string }>>`
      SELECT id, type
      FROM channels
      WHERE server_id = ${serverId}::uuid
        AND status = 'active'
    `;
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
  ) {
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
