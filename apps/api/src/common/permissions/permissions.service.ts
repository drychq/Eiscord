import { HttpStatus, Injectable, Optional } from '@nestjs/common';

import { ErrorCode } from '@eiscord/shared';

import { AppError } from '../errors/app-error';
import { PrismaService } from '../persistence/prisma.service';
import { AuditService } from '../../modules/audit/audit.service';
import { PermissionCheckInput } from './permission.types';

type AccessRow = {
  allowed: number;
};

@Injectable()
export class PermissionsService {
  constructor(
    @Optional() private readonly auditService?: AuditService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async assertAllowed(input: PermissionCheckInput): Promise<void> {
    if (input.user.accountStatus === 'disabled') {
      await this.deny(input, 'account_disabled');
    }

    if (!this.prisma) {
      await this.deny(input, 'permission_service_unavailable');
    }

    if (input.resource.type === 'dm') {
      await this.assertDirectConversationParticipant(input);
      return;
    }

    if (input.resource.type === 'server') {
      await this.assertServerMember(input);
      return;
    }

    if (input.resource.type === 'channel' || input.resource.type === 'voice') {
      await this.assertChannelServerMember(input);
      return;
    }

    await this.deny(input, 'unsupported_resource_type');
  }

  private async assertDirectConversationParticipant(input: PermissionCheckInput): Promise<void> {
    const [row] = await this.prisma!.$queryRaw<AccessRow[]>`
      SELECT 1 AS "allowed"
      FROM direct_conversations
      WHERE id = ${input.resource.id}::uuid
        AND (
          participant_a_id = ${input.user.userId}::uuid
          OR participant_b_id = ${input.user.userId}::uuid
        )
      LIMIT 1
    `;

    if (!row) {
      await this.deny(input, 'not_dm_participant');
    }
  }

  private async assertServerMember(input: PermissionCheckInput): Promise<void> {
    const [row] = await this.prisma!.$queryRaw<AccessRow[]>`
      SELECT 1 AS "allowed"
      FROM memberships m
      INNER JOIN servers s ON s.id = m.server_id
      WHERE m.server_id = ${input.resource.id}::uuid
        AND m.user_id = ${input.user.userId}::uuid
        AND m.member_status IN ('active', 'muted')
        AND s.status = 'active'
      LIMIT 1
    `;

    if (!row) {
      await this.deny(input, 'not_server_member');
    }
  }

  private async assertChannelServerMember(input: PermissionCheckInput): Promise<void> {
    const [row] = await this.prisma!.$queryRaw<AccessRow[]>`
      SELECT 1 AS "allowed"
      FROM channels c
      INNER JOIN servers s ON s.id = c.server_id
      INNER JOIN memberships m
        ON m.server_id = c.server_id
       AND m.user_id = ${input.user.userId}::uuid
      WHERE c.id = ${input.resource.id}::uuid
        AND c.status = 'active'
        AND s.status = 'active'
        AND m.member_status IN ('active', 'muted')
      LIMIT 1
    `;

    if (!row) {
      await this.deny(input, 'not_channel_server_member');
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
