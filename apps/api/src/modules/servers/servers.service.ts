import { randomBytes, randomUUID } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';

import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import { buildRealtimeRoom } from '../realtime/realtime.rooms';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { CreateServerDto } from './dto/create-server.dto';
import { JoinServerDto } from './dto/join-server.dto';
import {
  ChannelRow,
  MemberSummary,
  MemberRow,
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

@Injectable()
export class ServersService {
  constructor(
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
    private readonly realtimePublisher: RealtimePublisher,
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
        VALUES (${randomUUID()}::uuid, ${server.id}::uuid, 'Member', 0, null, 0, true)
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
      this.listChannels(serverId),
      this.listServerMembersRows(serverId),
      this.listRoles(serverId),
    ]);

    return {
      ...toServerBaseSummary(membership),
      channels: channels.map(toChannelSummary),
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

    return { ok: true };
  }

  async listMembers(user: AuthenticatedUserContext, serverId: string): Promise<MemberSummary[]> {
    await this.getActiveServerMembership(user.userId, serverId);
    const rows = await this.listServerMembersRows(serverId);

    return rows.map(toMemberSummary);
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

  private async listChannels(serverId: string): Promise<ChannelRow[]> {
    return this.prisma.$queryRaw<ChannelRow[]>`
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
  }

  private async listRoles(serverId: string): Promise<RoleRow[]> {
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

function toMemberSummaryWithRole(
  row: MemberRow,
  roleId: string,
): ReturnType<typeof toMemberSummary> {
  return toMemberSummary({ ...row, roleIds: [roleId] });
}
