import { HttpStatus, Injectable, Optional } from '@nestjs/common';

import { ErrorCode, PermissionBit } from '@eiscord/shared';

import { AppError } from '../errors/app-error';
import { PrismaService } from '../../infra/persistence/prisma.service';
import { AuditService } from '../../modules/audit/audit.service';
import { AuthenticatedUserContext } from '../auth/auth.types';
import { PermissionAction, PermissionCheckInput, PermissionDecision } from './permission.types';

type RawSqlExecutor = Pick<PrismaService, '$queryRaw'>;

type DirectConversationRow = {
  allowed: number;
};

type ServerContextRow = {
  highestPriority: number | null;
  memberStatus: string | null;
  membershipId: string | null;
  ownerId: string;
  permissionBits: bigint | number | string | null;
  roleIds: string[] | null;
  serverId: string;
};

type ChannelRow = {
  channelId: string;
  serverId: string;
  type: string;
};

type PermissionOverwriteRow = {
  allowBits: bigint | number | string;
  denyBits: bigint | number | string;
  targetId: string;
  targetType: 'member' | 'role';
};

export type ServerPermissionContext = {
  highestPriority: number;
  isOwner: boolean;
  memberStatus: string | null;
  membershipId: string | null;
  ownerId: string;
  permissionBits: bigint;
  roleIds: string[];
  serverId: string;
};

export type MemberHierarchy = {
  highestPriority: number;
  isOwner: boolean;
  memberStatus: string;
  membershipId: string;
  serverId: string;
  userId: string;
};

export type RoleHierarchy = {
  color: string | null;
  isDefault: boolean;
  name: string;
  permissionBits: bigint;
  priority: number;
  roleId: string;
  serverId: string;
};

@Injectable()
export class PermissionsService {
  constructor(
    @Optional() private readonly auditService?: AuditService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async assertAllowed(input: PermissionCheckInput): Promise<void> {
    const decision = await this.checkAllowed(input);

    if (!decision.allowed) {
      await this.deny(input, decision.reason ?? 'permission_denied');
    }
  }

  async checkAllowed(input: PermissionCheckInput): Promise<PermissionDecision> {
    if (input.user.accountStatus === 'disabled') {
      return denyDecision('account_disabled');
    }

    if (!this.prisma) {
      return denyDecision('permission_service_unavailable');
    }

    if (input.resource.type === 'dm') {
      return this.checkDirectConversationParticipant(input);
    }

    if (input.resource.type === 'server') {
      return this.checkServerPermission(input);
    }

    if (input.resource.type === 'channel' || input.resource.type === 'voice') {
      return this.checkChannelPermission(input);
    }

    return denyDecision('unsupported_resource_type');
  }

  async assertCanManageMember(
    user: AuthenticatedUserContext,
    serverId: string,
    targetMembershipId: string,
    requestId?: string,
  ): Promise<MemberHierarchy> {
    const actor = await this.assertServerActionContext(
      user,
      serverId,
      PermissionAction.ManageMember,
      requestId,
    );
    const target = await this.getMemberHierarchy(serverId, targetMembershipId);

    if (!target) {
      await this.denyForServerAction(user, serverId, PermissionAction.ManageMember, 'target_member_missing', requestId);
    }

    await this.assertActorCanTargetMember(actor, target!, PermissionAction.ManageMember, user, requestId);

    return target!;
  }

  async assertCanMutateRole(
    user: AuthenticatedUserContext,
    serverId: string,
    input: {
      desiredPermissionBits?: bigint;
      desiredPriority?: number;
      targetRoleId?: string;
    },
    requestId?: string,
  ): Promise<RoleHierarchy | null> {
    const actor = await this.assertServerActionContext(
      user,
      serverId,
      PermissionAction.ManageRole,
      requestId,
    );
    const target = input.targetRoleId ? await this.getRoleHierarchy(input.targetRoleId) : null;

    if (input.targetRoleId && (!target || target.serverId !== serverId)) {
      await this.denyForServerAction(user, serverId, PermissionAction.ManageRole, 'target_role_missing', requestId);
    }

    if (!actor.isOwner) {
      const targetPriority = target?.priority ?? -1;
      const desiredPriority = input.desiredPriority ?? target?.priority ?? 0;

      if (target && actor.highestPriority <= targetPriority) {
        await this.denyForServerAction(user, serverId, PermissionAction.ManageRole, 'target_role_not_lower', requestId);
      }

      if (actor.highestPriority <= desiredPriority) {
        await this.denyForServerAction(user, serverId, PermissionAction.ManageRole, 'desired_role_not_lower', requestId);
      }

      if (
        input.desiredPermissionBits !== undefined &&
        (input.desiredPermissionBits & ~actor.permissionBits) !== 0n
      ) {
        await this.denyForServerAction(user, serverId, PermissionAction.ManageRole, 'permission_escalation', requestId);
      }
    }

    return target;
  }

  async assertCanAssignRoleToMember(
    user: AuthenticatedUserContext,
    serverId: string,
    targetMembershipId: string,
    roleId: string,
    requestId?: string,
  ): Promise<{ role: RoleHierarchy; target: MemberHierarchy }> {
    const actor = await this.assertServerActionContext(
      user,
      serverId,
      PermissionAction.ManageRole,
      requestId,
    );
    const [target, role] = await Promise.all([
      this.getMemberHierarchy(serverId, targetMembershipId),
      this.getRoleHierarchy(roleId),
    ]);

    if (!target) {
      await this.denyForServerAction(user, serverId, PermissionAction.ManageRole, 'target_member_missing', requestId);
    }

    if (!role || role.serverId !== serverId) {
      await this.denyForServerAction(user, serverId, PermissionAction.ManageRole, 'target_role_missing', requestId);
    }

    await this.assertActorCanTargetMember(actor, target!, PermissionAction.ManageRole, user, requestId);

    if (!actor.isOwner) {
      if (actor.highestPriority <= role!.priority) {
        await this.denyForServerAction(user, serverId, PermissionAction.ManageRole, 'target_role_not_lower', requestId);
      }

      if ((role!.permissionBits & ~actor.permissionBits) !== 0n) {
        await this.denyForServerAction(user, serverId, PermissionAction.ManageRole, 'permission_escalation', requestId);
      }
    }

    return { role: role!, target: target! };
  }

  async listUsersWithChannelPermission(
    channelId: string,
    action: PermissionAction = PermissionAction.ViewChannel,
  ): Promise<string[]> {
    if (!this.prisma) {
      return [];
    }

    const [channel] = await this.prisma.$queryRaw<ChannelRow[]>`
      SELECT
        c.id AS "channelId",
        c.server_id AS "serverId",
        c.type
      FROM channels c
      INNER JOIN servers s ON s.id = c.server_id
      WHERE c.id = ${channelId}::uuid
        AND c.status = 'active'
        AND s.status = 'active'
      LIMIT 1
    `;

    if (!channel) {
      return [];
    }

    const members = await this.prisma.$queryRaw<Array<{ accountStatus: AuthenticatedUserContext['accountStatus']; userId: string }>>`
      SELECT u.id AS "userId", u.account_status AS "accountStatus"
      FROM memberships m
      INNER JOIN users u ON u.id = m.user_id
      WHERE m.server_id = ${channel.serverId}::uuid
        AND m.member_status IN ('active', 'muted')
        AND u.account_status <> 'disabled'
    `;
    const allowed: string[] = [];

    for (const member of members) {
      const decision = await this.checkAllowed({
        action,
        resource: { id: channelId, type: channel.type === 'voice' ? 'voice' : 'channel' },
        user: {
          accountStatus: member.accountStatus,
          sessionId: '',
          userId: member.userId,
        },
      });

      if (decision.allowed) {
        allowed.push(member.userId);
      }
    }

    return allowed;
  }

  async getServerContext(serverId: string, userId: string): Promise<ServerPermissionContext | null> {
    if (!this.prisma) {
      return null;
    }

    return this.loadServerContext(this.prisma, serverId, userId);
  }

  private async assertServerActionContext(
    user: AuthenticatedUserContext,
    serverId: string,
    action: PermissionAction,
    requestId?: string,
  ): Promise<ServerPermissionContext> {
    const context = await this.loadServerContext(this.prisma!, serverId, user.userId);
    const decision = context ? this.evaluateServerAction(context, action) : denyDecision('server_missing');

    if (!decision.allowed || !context) {
      await this.denyForServerAction(user, serverId, action, decision.reason ?? 'permission_denied', requestId);
    }

    return context!;
  }

  private async checkDirectConversationParticipant(input: PermissionCheckInput): Promise<PermissionDecision> {
    const [row] = await this.prisma!.$queryRaw<DirectConversationRow[]>`
      SELECT 1 AS "allowed"
      FROM direct_conversations
      WHERE id = ${input.resource.id}::uuid
        AND (
          participant_a_id = ${input.user.userId}::uuid
          OR participant_b_id = ${input.user.userId}::uuid
        )
      LIMIT 1
    `;

    return row ? allowDecision() : denyDecision('not_dm_participant');
  }

  private async checkServerPermission(input: PermissionCheckInput): Promise<PermissionDecision> {
    const context = await this.loadServerContext(this.prisma!, input.resource.id, input.user.userId);

    if (!context) {
      return denyDecision('server_missing');
    }

    return this.evaluateServerAction(context, input.action);
  }

  private async checkChannelPermission(input: PermissionCheckInput): Promise<PermissionDecision> {
    const [channel] = await this.prisma!.$queryRaw<ChannelRow[]>`
      SELECT
        c.id AS "channelId",
        c.server_id AS "serverId",
        c.type
      FROM channels c
      INNER JOIN servers s ON s.id = c.server_id
      WHERE c.id = ${input.resource.id}::uuid
        AND c.status = 'active'
        AND s.status = 'active'
      LIMIT 1
    `;

    if (!channel) {
      return denyDecision('channel_missing');
    }

    if (input.action === PermissionAction.SendMessage && channel.type !== 'text') {
      return denyDecision('not_text_channel');
    }

    if (
      (input.action === PermissionAction.JoinVoice || input.resource.type === 'voice') &&
      channel.type !== 'voice'
    ) {
      return denyDecision('not_voice_channel');
    }

    const context = await this.loadServerContext(this.prisma!, channel.serverId, input.user.userId);

    if (!context) {
      return denyDecision('server_missing');
    }

    if (context.isOwner) {
      return allowDecision();
    }

    if (!isActiveOrMuted(context.memberStatus)) {
      return denyDecision('not_server_member');
    }

    const requiredBits = requiredChannelBits(input.action);

    if (requiredBits === 0n) {
      return allowDecision();
    }

    const effectiveBits = await this.computeChannelPermissionBits(channel.channelId, context);

    return hasAllBits(effectiveBits, requiredBits)
      ? allowDecision()
      : denyDecision(`missing_permission:${input.action}`);
  }

  private evaluateServerAction(
    context: ServerPermissionContext,
    action: PermissionAction,
  ): PermissionDecision {
    if (context.isOwner) {
      return allowDecision();
    }

    if (!isActiveOrMuted(context.memberStatus)) {
      return denyDecision('not_server_member');
    }

    const requiredBits = requiredServerBits(action);

    if (requiredBits === 0n) {
      return allowDecision();
    }

    if (context.memberStatus === 'muted' && action === PermissionAction.SendMessage) {
      return denyDecision('member_muted');
    }

    return hasAllBits(context.permissionBits, requiredBits)
      ? allowDecision()
      : denyDecision(`missing_permission:${action}`);
  }

  private async loadServerContext(
    tx: RawSqlExecutor,
    serverId: string,
    userId: string,
  ): Promise<ServerPermissionContext | null> {
    const [row] = await tx.$queryRaw<ServerContextRow[]>`
      SELECT
        s.id AS "serverId",
        s.owner_id AS "ownerId",
        m.id AS "membershipId",
        m.member_status AS "memberStatus",
        COALESCE(BIT_OR(r.permission_bits), 0)::text AS "permissionBits",
        COALESCE(MAX(r.priority), 0)::int AS "highestPriority",
        COALESCE(array_agg(r.id::text) FILTER (WHERE r.id IS NOT NULL), ARRAY[]::text[]) AS "roleIds"
      FROM servers s
      LEFT JOIN memberships m
        ON m.server_id = s.id
       AND m.user_id = ${userId}::uuid
      LEFT JOIN membership_roles mr ON mr.membership_id = m.id
      LEFT JOIN roles r ON r.id = mr.role_id
      WHERE s.id = ${serverId}::uuid
        AND s.status = 'active'
      GROUP BY s.id, m.id
      LIMIT 1
    `;

    if (!row) {
      return null;
    }

    return {
      highestPriority: row.highestPriority ?? 0,
      isOwner: row.ownerId === userId,
      memberStatus: row.memberStatus,
      membershipId: row.membershipId,
      ownerId: row.ownerId,
      permissionBits: toBits(row.permissionBits ?? 0),
      roleIds: row.roleIds ?? [],
      serverId: row.serverId,
    };
  }

  private async computeChannelPermissionBits(
    channelId: string,
    context: ServerPermissionContext,
  ): Promise<bigint> {
    let effectiveBits = context.permissionBits;
    const overwrites = await this.prisma!.$queryRaw<PermissionOverwriteRow[]>`
      SELECT
        target_type AS "targetType",
        target_id AS "targetId",
        allow_bits AS "allowBits",
        deny_bits AS "denyBits"
      FROM permission_overwrites
      WHERE channel_id = ${channelId}::uuid
    `;
    const roleOverwrites = overwrites.filter(
      (overwrite) => overwrite.targetType === 'role' && context.roleIds.includes(overwrite.targetId),
    );
    const memberOverwrite = overwrites.find(
      (overwrite) =>
        overwrite.targetType === 'member' &&
        context.membershipId !== null &&
        overwrite.targetId === context.membershipId,
    );
    const roleDenyBits = roleOverwrites.reduce((bits, overwrite) => bits | toBits(overwrite.denyBits), 0n);
    const roleAllowBits = roleOverwrites.reduce((bits, overwrite) => bits | toBits(overwrite.allowBits), 0n);

    effectiveBits = (effectiveBits & ~roleDenyBits) | (roleAllowBits & ~roleDenyBits);

    if (memberOverwrite) {
      effectiveBits = (effectiveBits | toBits(memberOverwrite.allowBits)) & ~toBits(memberOverwrite.denyBits);
    }

    if (context.memberStatus === 'muted') {
      effectiveBits &= ~BigInt(PermissionBit.SendMessage);
    }

    return effectiveBits;
  }

  private async getMemberHierarchy(
    serverId: string,
    membershipId: string,
  ): Promise<MemberHierarchy | null> {
    const [row] = await this.prisma!.$queryRaw<Array<{
      highestPriority: number | null;
      memberStatus: string;
      membershipId: string;
      ownerId: string;
      serverId: string;
      userId: string;
    }>>`
      SELECT
        m.id AS "membershipId",
        m.server_id AS "serverId",
        m.user_id AS "userId",
        m.member_status AS "memberStatus",
        s.owner_id AS "ownerId",
        COALESCE(MAX(r.priority), 0)::int AS "highestPriority"
      FROM memberships m
      INNER JOIN servers s ON s.id = m.server_id
      LEFT JOIN membership_roles mr ON mr.membership_id = m.id
      LEFT JOIN roles r ON r.id = mr.role_id
      WHERE m.server_id = ${serverId}::uuid
        AND m.id = ${membershipId}::uuid
        AND s.status = 'active'
      GROUP BY m.id, s.id
      LIMIT 1
    `;

    if (!row) {
      return null;
    }

    return {
      highestPriority: row.highestPriority ?? 0,
      isOwner: row.ownerId === row.userId,
      memberStatus: row.memberStatus,
      membershipId: row.membershipId,
      serverId: row.serverId,
      userId: row.userId,
    };
  }

  private async getRoleHierarchy(roleId: string): Promise<RoleHierarchy | null> {
    const [row] = await this.prisma!.$queryRaw<Array<{
      color: string | null;
      isDefault: boolean;
      name: string;
      permissionBits: bigint | number | string;
      priority: number;
      roleId: string;
      serverId: string;
    }>>`
      SELECT
        id AS "roleId",
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

    return row
      ? {
          ...row,
          permissionBits: toBits(row.permissionBits),
        }
      : null;
  }

  private async denyForServerAction(
    user: AuthenticatedUserContext,
    serverId: string,
    action: PermissionAction,
    reason: string,
    requestId?: string,
  ): Promise<never> {
    return this.deny(
      {
        action,
        requestId,
        resource: { id: serverId, type: 'server' },
        user,
      },
      reason,
    );
  }

  private async assertActorCanTargetMember(
    actor: ServerPermissionContext,
    target: MemberHierarchy,
    action: PermissionAction,
    user: AuthenticatedUserContext,
    requestId?: string,
  ): Promise<void> {
    if (target.isOwner) {
      await this.denyForServerAction(user, actor.serverId, action, 'target_is_owner', requestId);
    }

    if (!actor.isOwner && actor.highestPriority <= target.highestPriority) {
      await this.denyForServerAction(user, actor.serverId, action, 'target_member_not_lower', requestId);
    }
  }

  private async deny(input: PermissionCheckInput, reason: string): Promise<never> {
    await this.auditService?.record({
      action: `PermissionDenied:${input.action}`,
      actorId: input.user.userId,
      failureReason: reason,
      requestId: input.requestId,
      result: 'failure',
      targetId: input.resource.id,
      targetType: input.resource.type,
    });

    throw new AppError(ErrorCode.PermissionDenied, 'Permission denied.', HttpStatus.FORBIDDEN);
  }
}

function requiredServerBits(action: PermissionAction): bigint {
  switch (action) {
    case PermissionAction.ManageChannel:
      return BigInt(PermissionBit.ManageChannel);
    case PermissionAction.ManageMember:
      return BigInt(PermissionBit.ManageMember);
    case PermissionAction.ManageMessage:
      return BigInt(PermissionBit.ManageMessage);
    case PermissionAction.ManageRole:
      return BigInt(PermissionBit.ManageRole);
    case PermissionAction.CreateInvite:
      return BigInt(PermissionBit.CreateInvite);
    case PermissionAction.ViewAudit:
      return BigInt(PermissionBit.ViewAudit);
    default:
      return 0n;
  }
}

function requiredChannelBits(action: PermissionAction): bigint {
  switch (action) {
    case PermissionAction.AccessAttachment:
    case PermissionAction.SubscribeRealtime:
    case PermissionAction.ViewChannel:
      return BigInt(PermissionBit.ViewChannel);
    case PermissionAction.SendMessage:
      return BigInt(PermissionBit.ViewChannel | PermissionBit.SendMessage);
    case PermissionAction.JoinVoice:
      return BigInt(PermissionBit.ViewChannel | PermissionBit.JoinVoice);
    case PermissionAction.SpeakVoice:
      return BigInt(PermissionBit.ViewChannel | PermissionBit.JoinVoice | PermissionBit.SpeakVoice);
    case PermissionAction.ListenVoice:
      return BigInt(PermissionBit.ViewChannel | PermissionBit.JoinVoice | PermissionBit.ListenVoice);
    case PermissionAction.ManageChannel:
      return BigInt(PermissionBit.ManageChannel);
    case PermissionAction.ManageMessage:
      return BigInt(PermissionBit.ManageMessage);
    default:
      return 0n;
  }
}

function hasAllBits(permissionBits: bigint, requiredBits: bigint): boolean {
  return (permissionBits & requiredBits) === requiredBits;
}

function isActiveOrMuted(status: string | null): boolean {
  return status === 'active' || status === 'muted';
}

function toBits(value: bigint | number | string): bigint {
  return typeof value === 'bigint' ? value : BigInt(value);
}

function allowDecision(): PermissionDecision {
  return { allowed: true };
}

function denyDecision(reason: string): PermissionDecision {
  return { allowed: false, reason };
}
