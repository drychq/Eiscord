import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infra/persistence/prisma.service';
import type { RawSqlExecutor } from '../../infra/persistence/types';
import type { ChannelRow, PermissionOverwriteRow } from './channels.presenter';

export type NormalizedPermissionOverwrite = {
  allowBits: bigint;
  denyBits: bigint;
  targetId: string;
  targetType: 'member' | 'role';
};

export type ServerUserRow = {
  userId: string;
};

export type InsertChannelInput = {
  name: string;
  serverId: string;
  sortOrder: number;
  topic: string | null;
  type: string;
};

export type UpdateChannelInput = {
  name: string;
  sortOrder: number;
  topic: string | null;
  type: string;
};

@Injectable()
export class ChannelsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insertChannel(
    executor: RawSqlExecutor,
    input: InsertChannelInput,
  ): Promise<ChannelRow> {
    const [created] = await executor.$queryRaw<ChannelRow[]>`
      INSERT INTO channels (id, server_id, name, type, topic, sort_order, status)
      VALUES (
        ${randomUUID()}::uuid,
        ${input.serverId}::uuid,
        ${input.name},
        ${input.type},
        ${input.topic},
        ${input.sortOrder},
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

    return created;
  }

  async seedChannelReadStates(
    executor: RawSqlExecutor,
    channelId: string,
    serverId: string,
  ): Promise<void> {
    await executor.$executeRaw`
      INSERT INTO read_states (id, user_id, scope_type, channel_id, last_read_message_id, unread_count)
      SELECT gen_random_uuid(), m.user_id, 'channel', ${channelId}::uuid, null, 0
      FROM memberships m
      WHERE m.server_id = ${serverId}::uuid
        AND m.member_status IN ('active', 'muted')
      ON CONFLICT (user_id, channel_id) DO NOTHING
    `;
  }

  async updateChannel(
    executor: RawSqlExecutor,
    channelId: string,
    input: UpdateChannelInput,
  ): Promise<ChannelRow> {
    const [updated] = await executor.$queryRaw<ChannelRow[]>`
      UPDATE channels
      SET
        name = ${input.name},
        type = ${input.type},
        topic = ${input.topic},
        sort_order = ${input.sortOrder},
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

    return updated;
  }

  async markChannelDeleted(
    executor: RawSqlExecutor,
    channelId: string,
  ): Promise<ChannelRow> {
    const [deleted] = await executor.$queryRaw<ChannelRow[]>`
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

    return deleted;
  }

  async findActiveChannelForMember(
    channelId: string,
    userId: string,
  ): Promise<ChannelRow | null> {
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

    return channel ?? null;
  }

  async deletePermissionOverwrites(
    executor: RawSqlExecutor,
    channelId: string,
  ): Promise<void> {
    await executor.$executeRaw`
      DELETE FROM permission_overwrites
      WHERE channel_id = ${channelId}::uuid
    `;
  }

  async insertPermissionOverwrite(
    executor: RawSqlExecutor,
    channelId: string,
    overwrite: NormalizedPermissionOverwrite,
  ): Promise<void> {
    await executor.$executeRaw`
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

  async findRoleInServer(
    executor: RawSqlExecutor,
    roleId: string,
    serverId: string,
  ): Promise<{ id: string } | null> {
    const [role] = await executor.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM roles
      WHERE id = ${roleId}::uuid
        AND server_id = ${serverId}::uuid
      LIMIT 1
    `;

    return role ?? null;
  }

  async findActiveMembership(
    executor: RawSqlExecutor,
    membershipId: string,
    serverId: string,
  ): Promise<{ id: string } | null> {
    const [member] = await executor.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM memberships
      WHERE id = ${membershipId}::uuid
        AND server_id = ${serverId}::uuid
        AND member_status IN ('active', 'muted')
      LIMIT 1
    `;

    return member ?? null;
  }

  listPermissionOverwrites(
    executor: RawSqlExecutor,
    channelId: string,
  ): Promise<PermissionOverwriteRow[]> {
    return executor.$queryRaw<PermissionOverwriteRow[]>`
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

  async listServerActiveUserIds(serverId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<ServerUserRow[]>`
      SELECT user_id AS "userId"
      FROM memberships
      WHERE server_id = ${serverId}::uuid
        AND member_status IN ('active', 'muted')
    `;

    return rows.map((row) => row.userId);
  }
}
