import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { DEFAULT_MEMBER_PERMISSION_BITS } from '@eiscord/shared';

import { PrismaService } from '../../infra/persistence/prisma.service';
import type { RawSqlExecutor } from '../../infra/persistence/types';
import type {
  ChannelRow,
  MemberRow,
  PermissionOverwriteRow,
  RoleRow,
  ServerListRow,
  ServerRow,
} from './servers.presenter';

export type AttachmentLookupRow = {
  id: string;
};

export type InvitationRow = {
  code: string;
  expiresAt: Date | null;
  id: string;
  maxUses: number | null;
  serverId: string;
  serverStatus: string;
  status: string;
  usedCount: number;
};

export type MembershipLookupRow = {
  id: string;
  memberStatus: string;
  serverId: string;
  userId: string;
};

export type ServerMembershipRow = ServerRow & {
  membershipId: string;
  membershipStatus: string;
};

export type ServerUserRow = {
  userId: string;
};

export type ServerChannelLite = {
  id: string;
  type: string;
};

export type InsertServerInput = {
  description: string | null;
  iconAttachmentId: string | null;
  name: string;
  ownerId: string;
};

export type InsertInvitationInput = {
  code: string;
  createdById: string;
  serverId: string;
};

export type InsertRoleInput = {
  color: string | null;
  name: string;
  permissionBits: bigint;
  priority: number;
  serverId: string;
};

export type UpdateRoleInput = {
  color: string | null;
  name: string;
  permissionBits: bigint;
  priority: number;
  roleId: string;
};

@Injectable()
export class ServersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findReadyServerIconAttachment(
    attachmentId: string,
    ownerId: string,
  ): Promise<AttachmentLookupRow | null> {
    return this.prisma.$queryRaw<AttachmentLookupRow[]>`
      SELECT id
      FROM attachments
      WHERE id = ${attachmentId}::uuid
        AND owner_id = ${ownerId}::uuid
        AND purpose = 'server_icon'
        AND status = 'ready'
      LIMIT 1
    `.then((rows) => rows[0] ?? null);
  }

  async insertServer(
    executor: RawSqlExecutor,
    input: InsertServerInput,
  ): Promise<ServerRow> {
    const [server] = await executor.$queryRaw<ServerRow[]>`
      INSERT INTO servers (id, owner_id, name, icon_attachment_id, description, status)
      VALUES (
        ${randomUUID()}::uuid,
        ${input.ownerId}::uuid,
        ${input.name},
        ${input.iconAttachmentId}::uuid,
        ${input.description},
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

    return server;
  }

  async insertOwnerMembership(
    executor: RawSqlExecutor,
    serverId: string,
    userId: string,
  ): Promise<MemberRow> {
    const [member] = await executor.$queryRaw<MemberRow[]>`
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
        id AS "membershipId",
        server_id AS "serverId",
        user_id AS "userId",
        nick_in_server AS "nickInServer",
        member_status AS "memberStatus",
        joined_at AS "joinedAt",
        ARRAY[]::text[] AS "roleIds",
        (SELECT username FROM users WHERE id = ${userId}::uuid) AS "username",
        (SELECT nickname FROM users WHERE id = ${userId}::uuid) AS "userNickname",
        (SELECT avatar_attachment_id FROM users WHERE id = ${userId}::uuid) AS "avatarAttachmentId",
        (SELECT presence_status FROM users WHERE id = ${userId}::uuid) AS "presenceStatus"
    `;

    return member;
  }

  async insertDefaultRole(executor: RawSqlExecutor, serverId: string): Promise<RoleRow> {
    const [role] = await executor.$queryRaw<RoleRow[]>`
      INSERT INTO roles (id, server_id, name, permission_bits, color, priority, is_default)
      VALUES (
        ${randomUUID()}::uuid,
        ${serverId}::uuid,
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

    return role;
  }

  async insertMembershipRole(
    executor: RawSqlExecutor,
    membershipId: string,
    roleId: string,
    assignedById: string,
  ): Promise<void> {
    await executor.$executeRaw`
      INSERT INTO membership_roles (membership_id, role_id, assigned_by_id)
      VALUES (${membershipId}::uuid, ${roleId}::uuid, ${assignedById}::uuid)
    `;
  }

  async insertMembershipRoleIgnoreConflict(
    executor: RawSqlExecutor,
    membershipId: string,
    roleId: string,
    assignedById: string,
  ): Promise<void> {
    await executor.$executeRaw`
      INSERT INTO membership_roles (membership_id, role_id, assigned_by_id)
      VALUES (${membershipId}::uuid, ${roleId}::uuid, ${assignedById}::uuid)
      ON CONFLICT (membership_id, role_id) DO NOTHING
    `;
  }

  async insertDefaultChannel(executor: RawSqlExecutor, serverId: string): Promise<ChannelRow> {
    const [channel] = await executor.$queryRaw<ChannelRow[]>`
      INSERT INTO channels (id, server_id, name, type, topic, sort_order, status)
      VALUES (${randomUUID()}::uuid, ${serverId}::uuid, 'general', 'text', null, 0, 'active')
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

    return channel;
  }

  async insertChannelReadState(
    executor: RawSqlExecutor,
    userId: string,
    channelId: string,
  ): Promise<void> {
    await executor.$executeRaw`
      INSERT INTO read_states (id, user_id, scope_type, channel_id, last_read_message_id, unread_count)
      VALUES (
        gen_random_uuid(),
        ${userId}::uuid,
        'channel',
        ${channelId}::uuid,
        null,
        0
      )
      ON CONFLICT (user_id, channel_id) DO NOTHING
    `;
  }

  async insertInvitation(
    executor: RawSqlExecutor,
    input: InsertInvitationInput,
  ): Promise<void> {
    await executor.$executeRaw`
      INSERT INTO invitations (id, server_id, code, created_by_id, expires_at, max_uses, used_count, status)
      VALUES (
        ${randomUUID()}::uuid,
        ${input.serverId}::uuid,
        ${input.code},
        ${input.createdById}::uuid,
        null,
        null,
        0,
        'active'
      )
    `;
  }

  listMembershipServers(userId: string): Promise<ServerListRow[]> {
    return this.prisma.$queryRaw<ServerListRow[]>`
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
      WHERE m.user_id = ${userId}::uuid
        AND m.member_status IN ('active', 'muted')
        AND s.status = 'active'
      ORDER BY m.joined_at DESC
    `;
  }

  getInvitationForUpdate(
    executor: RawSqlExecutor,
    inviteCode: string,
  ): Promise<InvitationRow | null> {
    return executor.$queryRaw<InvitationRow[]>`
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
    `.then((rows) => rows[0] ?? null);
  }

  getDefaultRole(executor: RawSqlExecutor, serverId: string): Promise<RoleRow | null> {
    return executor.$queryRaw<RoleRow[]>`
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
    `.then((rows) => rows[0] ?? null);
  }

  getMembershipForUpdate(
    executor: RawSqlExecutor,
    serverId: string,
    userId: string,
  ): Promise<MembershipLookupRow | null> {
    return executor.$queryRaw<MembershipLookupRow[]>`
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
    `.then((rows) => rows[0] ?? null);
  }

  async createMembership(
    executor: RawSqlExecutor,
    serverId: string,
    userId: string,
  ): Promise<MembershipLookupRow> {
    const [membership] = await executor.$queryRaw<MembershipLookupRow[]>`
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

  async restoreMembership(
    executor: RawSqlExecutor,
    membershipId: string,
    userId: string,
  ): Promise<MembershipLookupRow> {
    const [membership] = await executor.$queryRaw<MembershipLookupRow[]>`
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

  async insertTextChannelReadStates(
    executor: RawSqlExecutor,
    userId: string,
    serverId: string,
  ): Promise<void> {
    await executor.$executeRaw`
      INSERT INTO read_states (id, user_id, scope_type, channel_id, last_read_message_id, unread_count)
      SELECT gen_random_uuid(), ${userId}::uuid, 'channel', c.id, null, 0
      FROM channels c
      WHERE c.server_id = ${serverId}::uuid
        AND c.type = 'text'
        AND c.status = 'active'
      ON CONFLICT (user_id, channel_id) DO NOTHING
    `;
  }

  async incrementInvitationUseCount(
    executor: RawSqlExecutor,
    invitationId: string,
  ): Promise<void> {
    await executor.$executeRaw`
      UPDATE invitations
      SET used_count = used_count + 1, updated_at = NOW()
      WHERE id = ${invitationId}::uuid
    `;
  }

  getServerMembershipForUpdate(
    executor: RawSqlExecutor,
    serverId: string,
    userId: string,
  ): Promise<ServerMembershipRow | null> {
    return executor.$queryRaw<ServerMembershipRow[]>`
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
    `.then((rows) => rows[0] ?? null);
  }

  async deleteAllMembershipRoles(
    executor: RawSqlExecutor,
    membershipId: string,
  ): Promise<void> {
    await executor.$executeRaw`
      DELETE FROM membership_roles
      WHERE membership_id = ${membershipId}::uuid
    `;
  }

  async markMembershipRemoved(
    executor: RawSqlExecutor,
    membershipId: string,
  ): Promise<void> {
    await executor.$executeRaw`
      UPDATE memberships
      SET member_status = 'removed', updated_at = NOW()
      WHERE id = ${membershipId}::uuid
    `;
  }

  async updateMembershipStatus(
    executor: RawSqlExecutor,
    serverId: string,
    membershipId: string,
    status: 'muted' | 'active' | 'removed',
  ): Promise<MemberRow> {
    const [updated] = await executor.$queryRaw<MemberRow[]>`
      UPDATE memberships
      SET member_status = ${status}, updated_at = NOW()
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
  }

  getActiveServerMembership(
    userId: string,
    serverId: string,
  ): Promise<(ServerRow & MemberRow) | null> {
    return this.prisma.$queryRaw<Array<ServerRow & MemberRow>>`
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
    `.then((rows) => rows[0] ?? null);
  }

  listActiveChannelsByServer(serverId: string): Promise<ChannelRow[]> {
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

  listRoleRows(serverId: string): Promise<RoleRow[]> {
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

  listPermissionOverwritesForChannels(
    channelIds: string[],
  ): Promise<PermissionOverwriteRow[]> {
    if (channelIds.length === 0) {
      return Promise.resolve([]);
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

  listServerMembersRows(serverId: string): Promise<MemberRow[]> {
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

  getMemberRowById(serverId: string, membershipId: string): Promise<MemberRow | null> {
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
        AND m.id = ${membershipId}::uuid
      GROUP BY m.id, u.id
      LIMIT 1
    `.then((rows) => rows[0] ?? null);
  }

  getRoleRow(roleId: string): Promise<RoleRow | null> {
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
      WHERE id = ${roleId}::uuid
      LIMIT 1
    `.then((rows) => rows[0] ?? null);
  }

  async insertRole(executor: RawSqlExecutor, input: InsertRoleInput): Promise<RoleRow> {
    const [role] = await executor.$queryRaw<RoleRow[]>`
      INSERT INTO roles (id, server_id, name, permission_bits, color, priority, is_default)
      VALUES (
        ${randomUUID()}::uuid,
        ${input.serverId}::uuid,
        ${input.name},
        ${input.permissionBits},
        ${input.color},
        ${input.priority},
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

    return role;
  }

  async updateRoleRow(executor: RawSqlExecutor, input: UpdateRoleInput): Promise<RoleRow> {
    const [role] = await executor.$queryRaw<RoleRow[]>`
      UPDATE roles
      SET
        name = ${input.name},
        permission_bits = ${input.permissionBits},
        color = ${input.color},
        priority = ${input.priority},
        updated_at = NOW()
      WHERE id = ${input.roleId}::uuid
      RETURNING
        id,
        server_id AS "serverId",
        name,
        permission_bits AS "permissionBits",
        color,
        priority,
        is_default AS "isDefault"
    `;

    return role;
  }

  async deleteRoleRow(executor: RawSqlExecutor, roleId: string): Promise<void> {
    await executor.$executeRaw`
      DELETE FROM roles
      WHERE id = ${roleId}::uuid
    `;
  }

  async deleteMembershipRole(
    executor: RawSqlExecutor,
    membershipId: string,
    roleId: string,
  ): Promise<void> {
    await executor.$executeRaw`
      DELETE FROM membership_roles
      WHERE membership_id = ${membershipId}::uuid
        AND role_id = ${roleId}::uuid
    `;
  }

  async listServerUserIds(serverId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<ServerUserRow[]>`
      SELECT user_id AS "userId"
      FROM memberships
      WHERE server_id = ${serverId}::uuid
        AND member_status IN ('active', 'muted')
    `;

    return rows.map((row) => row.userId);
  }

  listServerChannels(serverId: string): Promise<ServerChannelLite[]> {
    return this.prisma.$queryRaw<ServerChannelLite[]>`
      SELECT id, type
      FROM channels
      WHERE server_id = ${serverId}::uuid
        AND status = 'active'
    `;
  }
}
