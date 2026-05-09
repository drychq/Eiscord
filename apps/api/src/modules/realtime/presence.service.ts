import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import type { PresenceStatusValue } from '../users/dto/update-presence.dto';
import { toUserSummary, type UserRecord, type UserSummary } from '../users/user.presenter';
import { buildUserRoom } from './realtime.rooms';
import { RealtimePublisher } from './realtime.publisher';

const CONNECTION_TTL_SECONDS = 75;
const CONNECTION_TTL_MS = CONNECTION_TTL_SECONDS * 1000;
const DEFAULT_OFFLINE_GRACE_MS = 45_000;
const CONNECTION_EXPIRATIONS_KEY = 'presence:connection_expirations';
const OFFLINE_CANDIDATES_KEY = 'presence:offline_candidates';

type PresenceRow = UserRecord & {
  updatedAt: Date;
};

type VisibleRecipientRow = {
  userId: string;
};

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: RealtimePublisher,
    private readonly redis: RedisService,
  ) {}

  async trackConnection(
    user: AuthenticatedUserContext,
    connectionId: string,
    requestId?: string,
  ): Promise<void> {
    await this.storeConnection(user.userId, connectionId);
    const current = await this.getPresenceRow(user.userId);

    if (current?.presenceStatus === 'offline') {
      const updated = await this.setPresenceStatus(user.userId, 'online');

      if (updated) {
        await this.publishPresenceChanged(updated, requestId);
      }
    }
  }

  async heartbeat(user: AuthenticatedUserContext, connectionId: string): Promise<void> {
    await this.storeConnection(user.userId, connectionId);
  }

  async markDisconnected(user: AuthenticatedUserContext, connectionId: string): Promise<void> {
    const offlineGraceMs = getOfflineGraceMs();

    await this.redis.execute(async (client) => {
      await client.srem(userConnectionsKey(user.userId), connectionId);
      await client.del(connectionKey(connectionId));
      await client.zrem(CONNECTION_EXPIRATIONS_KEY, connectionMember(user.userId, connectionId));

      const activeCount = await client.scard(userConnectionsKey(user.userId));

      if (activeCount === 0) {
        await client.zadd(OFFLINE_CANDIDATES_KEY, String(Date.now() + offlineGraceMs), user.userId);
      }
    });
  }

  async updatePresence(
    user: AuthenticatedUserContext,
    desiredStatus: PresenceStatusValue,
    requestId?: string,
  ): Promise<UserSummary> {
    const updated = await this.setPresenceStatus(user.userId, desiredStatus);

    if (!updated) {
      throw new AppError(
        ErrorCode.AuthRequired,
        'Authenticated user no longer exists.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.publishPresenceChanged(updated, requestId);

    return toUserSummary(updated);
  }

  async finalizeOffline(userId: string, requestId?: string): Promise<boolean> {
    const current = await this.getPresenceRow(userId);

    if (!current || current.presenceStatus === 'offline') {
      return false;
    }

    const updated = await this.setPresenceStatus(userId, 'offline');

    if (!updated) {
      return false;
    }

    await this.publishPresenceChanged(updated, requestId);
    return true;
  }

  async sweepExpiredPresence(): Promise<string[]> {
    const now = Date.now();
    const offlineUserIds = new Set<string>();
    const result = await this.redis.execute(async (client) => {
      const expiredConnections = await client.zrangebyscore(
        CONNECTION_EXPIRATIONS_KEY,
        '-inf',
        String(now),
      );
      const affectedUserIds = new Set<string>();

      for (const member of expiredConnections) {
        const parsed = parseConnectionMember(member);

        if (!parsed) {
          await client.zrem(CONNECTION_EXPIRATIONS_KEY, member);
          continue;
        }

        await client.srem(userConnectionsKey(parsed.userId), parsed.connectionId);
        await client.del(connectionKey(parsed.connectionId));
        await client.zrem(CONNECTION_EXPIRATIONS_KEY, member);
        affectedUserIds.add(parsed.userId);
      }

      for (const userId of affectedUserIds) {
        const activeCount = await client.scard(userConnectionsKey(userId));

        if (activeCount === 0) {
          await client.zadd(OFFLINE_CANDIDATES_KEY, String(now + getOfflineGraceMs()), userId);
        }
      }

      const candidates = await client.zrangebyscore(OFFLINE_CANDIDATES_KEY, '-inf', String(now));
      const readyOfflineUserIds: string[] = [];

      for (const userId of candidates) {
        const activeCount = await client.scard(userConnectionsKey(userId));
        await client.zrem(OFFLINE_CANDIDATES_KEY, userId);

        if (activeCount === 0) {
          readyOfflineUserIds.push(userId);
        }
      }

      return readyOfflineUserIds;
    });

    for (const userId of result ?? []) {
      try {
        if (await this.finalizeOffline(userId)) {
          offlineUserIds.add(userId);
        }
      } catch (error) {
        this.logger.warn(`Failed to finalize offline presence for ${userId}: ${String(error)}`);
      }
    }

    return [...offlineUserIds];
  }

  private async storeConnection(userId: string, connectionId: string): Promise<void> {
    const member = connectionMember(userId, connectionId);

    await this.redis.execute(async (client) => {
      await client.set(
        connectionKey(connectionId),
        JSON.stringify({ connection_id: connectionId, user_id: userId }),
        'EX',
        CONNECTION_TTL_SECONDS,
      );
      await client.sadd(userConnectionsKey(userId), connectionId);
      await client.expire(userConnectionsKey(userId), CONNECTION_TTL_SECONDS + 60);
      await client.zadd(CONNECTION_EXPIRATIONS_KEY, String(Date.now() + CONNECTION_TTL_MS), member);
      await client.zrem(OFFLINE_CANDIDATES_KEY, userId);
    });
  }

  private async setPresenceStatus(
    userId: string,
    status: PresenceStatusValue,
  ): Promise<PresenceRow | null> {
    const [updated] = await this.prisma.$queryRaw<PresenceRow[]>`
      UPDATE users
      SET presence_status = ${status}, updated_at = NOW()
      WHERE id = ${userId}::uuid
      RETURNING
        id,
        username,
        email_or_phone AS "emailOrPhone",
        password_hash AS "passwordHash",
        nickname,
        avatar_attachment_id AS "avatarAttachmentId",
        bio,
        account_status AS "accountStatus",
        presence_status AS "presenceStatus",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `;

    return updated ?? null;
  }

  private async getPresenceRow(userId: string): Promise<PresenceRow | null> {
    const [row] = await this.prisma.$queryRaw<PresenceRow[]>`
      SELECT
        id,
        username,
        email_or_phone AS "emailOrPhone",
        password_hash AS "passwordHash",
        nickname,
        avatar_attachment_id AS "avatarAttachmentId",
        bio,
        account_status AS "accountStatus",
        presence_status AS "presenceStatus",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM users
      WHERE id = ${userId}::uuid
      LIMIT 1
    `;

    return row ?? null;
  }

  private async publishPresenceChanged(row: PresenceRow, requestId?: string): Promise<void> {
    const visibleStatus = row.presenceStatus === 'invisible' ? 'offline' : row.presenceStatus;
    const recipientIds = await this.listPresenceRecipientIds(row.id);

    this.publisher.publishToRoom(
      buildUserRoom(row.id),
      RealtimeEvent.PresenceChanged,
      {
        updated_at: row.updatedAt.toISOString(),
        user_id: row.id,
        visible_status: row.presenceStatus,
      },
      requestId,
    );

    for (const recipientId of recipientIds.filter((id) => id !== row.id)) {
      this.publisher.publishToRoom(
        buildUserRoom(recipientId),
        RealtimeEvent.PresenceChanged,
        {
          updated_at: row.updatedAt.toISOString(),
          user_id: row.id,
          visible_status: visibleStatus,
        },
        requestId,
      );
    }
  }

  private async listPresenceRecipientIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<VisibleRecipientRow[]>`
      SELECT DISTINCT recipient_id AS "userId"
      FROM (
        SELECT
          CASE
            WHEN f.requester_id = ${userId}::uuid THEN f.addressee_id
            ELSE f.requester_id
          END AS recipient_id
        FROM friendships f
        WHERE (f.requester_id = ${userId}::uuid OR f.addressee_id = ${userId}::uuid)
          AND f.status = 'accepted'

        UNION

        SELECT other_members.user_id AS recipient_id
        FROM memberships own_members
        INNER JOIN memberships other_members
          ON other_members.server_id = own_members.server_id
        WHERE own_members.user_id = ${userId}::uuid
          AND own_members.member_status IN ('active', 'muted')
          AND other_members.member_status IN ('active', 'muted')
      ) recipients
    `;

    return rows.map((row) => row.userId);
  }
}

function connectionKey(connectionId: string): string {
  return `presence:connection:${connectionId}`;
}

function userConnectionsKey(userId: string): string {
  return `presence:user:${userId}:connections`;
}

function connectionMember(userId: string, connectionId: string): string {
  return `${userId}:${connectionId}`;
}

function parseConnectionMember(member: string): { connectionId: string; userId: string } | null {
  const separatorIndex = member.indexOf(':');

  if (separatorIndex <= 0 || separatorIndex === member.length - 1) {
    return null;
  }

  return {
    connectionId: member.slice(separatorIndex + 1),
    userId: member.slice(0, separatorIndex),
  };
}

function getOfflineGraceMs(): number {
  const configured = Number(process.env.PRESENCE_OFFLINE_GRACE_MS);

  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_OFFLINE_GRACE_MS;
}
