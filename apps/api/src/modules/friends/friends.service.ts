import { randomUUID } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';

import { ErrorCode } from '@eiscord/shared';

import { AuthenticatedUserContext } from '../../core/auth/auth.types';
import { AppError } from '../../core/errors/app-error';
import { PersistenceCoordinator } from '../../infra/persistence/persistence-coordinator.service';
import { PrismaService } from '../../infra/persistence/prisma.service';
import type { RawSqlExecutor } from '../../infra/persistence/types';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateFriendRequestDto } from './dto/create-friend-request.dto';
import {
  DirectConversationRow,
  DirectConversationSummary,
  FriendUserRow,
  FriendshipRow,
  FriendshipSummary,
  toDirectConversationSummary,
  toFriendshipSummary,
} from './friends.presenter';

type FriendshipRecord = {
  addresseeId: string;
  createdAt: Date;
  id: string;
  requesterId: string;
  status: string;
  updatedAt: Date;
};

type DirectConversationRecord = {
  id: string;
  lastMessageId: string | null;
  participantAId: string;
  participantBId: string;
};

type FriendshipLookupRow = {
  id: string;
  status: string;
};

@Injectable()
export class FriendsService {
  constructor(
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly persistence: PersistenceCoordinator,
    private readonly prisma: PrismaService,
  ) {}

  async listFriends(user: AuthenticatedUserContext): Promise<FriendshipSummary[]> {
    const rows = await this.prisma.$queryRaw<FriendshipRow[]>`
      SELECT
        f.id AS "friendshipId",
        f.requester_id AS "requesterId",
        f.addressee_id AS "addresseeId",
        f.status,
        dc.id AS "conversationId",
        other_user.id AS "friendId",
        other_user.username AS "friendUsername",
        other_user.nickname AS "friendNickname",
        other_user.avatar_attachment_id AS "friendAvatarAttachmentId",
        other_user.bio AS "friendBio",
        other_user.account_status AS "friendAccountStatus",
        other_user.presence_status AS "friendPresenceStatus",
        other_user.created_at AS "friendCreatedAt"
      FROM friendships f
      INNER JOIN users other_user
        ON other_user.id = CASE
          WHEN f.requester_id = ${user.userId}::uuid THEN f.addressee_id
          ELSE f.requester_id
        END
      LEFT JOIN direct_conversations dc
        ON dc.participant_a_id = LEAST(f.requester_id, f.addressee_id)
       AND dc.participant_b_id = GREATEST(f.requester_id, f.addressee_id)
      WHERE (f.requester_id = ${user.userId}::uuid OR f.addressee_id = ${user.userId}::uuid)
        AND f.status IN ('pending', 'accepted', 'rejected')
      ORDER BY f.updated_at DESC
    `;

    return rows.map((row) => toFriendshipSummary(row, user.userId));
  }

  async createFriendRequest(
    user: AuthenticatedUserContext,
    dto: CreateFriendRequestDto,
    requestId?: string,
  ): Promise<FriendshipSummary> {
    const hasTargetUserId =
      typeof dto.target_user_id === 'string' && dto.target_user_id.trim().length > 0;
    const hasTargetUsername =
      typeof dto.target_username === 'string' && dto.target_username.trim().length > 0;

    if (hasTargetUserId === hasTargetUsername) {
      await this.recordFailure('CreateFriendRequest', user.userId, 'invalid_target', requestId);
      throw new AppError(
        ErrorCode.ValidationFailed,
        'Provide exactly one friend request target.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.target_user_id === user.userId) {
      await this.recordFailure('CreateFriendRequest', user.userId, 'self_request', requestId);
      throw new AppError(
        ErrorCode.ValidationFailed,
        'Cannot send a friend request to yourself.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const target = await this.resolveFriendTarget(dto);

    if (!target) {
      await this.recordFailure('CreateFriendRequest', user.userId, 'target_not_found', requestId);
      throw new AppError(
        ErrorCode.ResourceNotFound,
        'Target user was not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const targetUserId = target.friendId;

    if (targetUserId === user.userId) {
      await this.recordFailure('CreateFriendRequest', user.userId, 'self_request', requestId);
      throw new AppError(
        ErrorCode.ValidationFailed,
        'Cannot send a friend request to yourself.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const [existing] = await this.prisma.$queryRaw<FriendshipLookupRow[]>`
      SELECT id, status
      FROM friendships
      WHERE (
          (requester_id = ${user.userId}::uuid AND addressee_id = ${targetUserId}::uuid)
          OR (requester_id = ${targetUserId}::uuid AND addressee_id = ${user.userId}::uuid)
        )
        AND status IN ('pending', 'accepted')
      LIMIT 1
    `;

    if (existing) {
      await this.recordFailure(
        'CreateFriendRequest',
        user.userId,
        'active_friendship_exists',
        requestId,
      );
      throw new AppError(
        ErrorCode.Conflict,
        'A pending or accepted friendship already exists.',
        HttpStatus.CONFLICT,
      );
    }

    try {
      const friendshipId = await this.persistence.runWithEvents(async (tx, events) => {
        const [friendship] = await tx.$queryRaw<FriendshipRecord[]>`
          INSERT INTO friendships (id, requester_id, addressee_id, status)
          VALUES (${randomUUID()}::uuid, ${user.userId}::uuid, ${targetUserId}::uuid, 'pending')
          RETURNING
            id,
            requester_id AS "requesterId",
            addressee_id AS "addresseeId",
            status,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
        `;

        events.audit({
          action: 'CreateFriendRequest',
          actorId: user.userId,
          requestId,
          result: 'success',
          targetId: friendship.id,
          targetType: 'friendship',
        });

        const notification = await this.notificationsService.createNotification(tx, {
          contentPreview: 'New friend request',
          dedupeKey: `friendship:${friendship.id}:request`,
          sourceId: friendship.id,
          sourceType: 'friendship',
          type: 'friend_request',
          userId: targetUserId,
        });

        if (notification.created) {
          this.notificationsService.publishCreated(events, notification.notification, requestId);
        }

        return friendship.id;
      });

      return this.getFriendshipSummary(friendshipId, user.userId);
    } catch (error) {
      if (isUniqueConflict(error)) {
        await this.recordFailure(
          'CreateFriendRequest',
          user.userId,
          'active_friendship_exists',
          requestId,
        );
        throw new AppError(
          ErrorCode.Conflict,
          'A pending or accepted friendship already exists.',
          HttpStatus.CONFLICT,
        );
      }

      throw error;
    }
  }

  async acceptFriendRequest(
    user: AuthenticatedUserContext,
    friendshipId: string,
    requestId?: string,
  ): Promise<FriendshipSummary> {
    return this.updateFriendRequestStatus(user, friendshipId, 'accepted', requestId);
  }

  async rejectFriendRequest(
    user: AuthenticatedUserContext,
    friendshipId: string,
    requestId?: string,
  ): Promise<FriendshipSummary> {
    return this.updateFriendRequestStatus(user, friendshipId, 'rejected', requestId);
  }

  async listDirectConversations(
    user: AuthenticatedUserContext,
  ): Promise<DirectConversationSummary[]> {
    const rows = await this.prisma.$queryRaw<DirectConversationRow[]>`
      SELECT
        dc.id AS "conversationId",
        dc.last_message_id AS "lastMessageId",
        other_user.id AS "friendId",
        other_user.username AS "friendUsername",
        other_user.nickname AS "friendNickname",
        other_user.avatar_attachment_id AS "friendAvatarAttachmentId",
        other_user.bio AS "friendBio",
        other_user.account_status AS "friendAccountStatus",
        other_user.presence_status AS "friendPresenceStatus",
        other_user.created_at AS "friendCreatedAt"
      FROM direct_conversations dc
      INNER JOIN users other_user
        ON other_user.id = CASE
          WHEN dc.participant_a_id = ${user.userId}::uuid THEN dc.participant_b_id
          ELSE dc.participant_a_id
        END
      WHERE dc.participant_a_id = ${user.userId}::uuid
         OR dc.participant_b_id = ${user.userId}::uuid
      ORDER BY dc.updated_at DESC
    `;

    return rows.map(toDirectConversationSummary);
  }

  private async updateFriendRequestStatus(
    user: AuthenticatedUserContext,
    friendshipId: string,
    nextStatus: 'accepted' | 'rejected',
    requestId?: string,
  ): Promise<FriendshipSummary> {
    const updatedFriendshipId = await this.persistence.runWithEvents(async (tx, events) => {
      const current = await this.getFriendshipForUpdate(tx, friendshipId);

      if (!current) {
        await this.recordFailure(
          statusAction(nextStatus),
          user.userId,
          'friendship_not_found',
          requestId,
        );
        throw new AppError(
          ErrorCode.ResourceNotFound,
          'Friend request was not found.',
          HttpStatus.NOT_FOUND,
        );
      }

      if (current.addresseeId !== user.userId) {
        await this.recordFailure(statusAction(nextStatus), user.userId, 'not_addressee', requestId);
        throw new AppError(
          ErrorCode.PermissionDenied,
          'Only the request addressee can handle this friend request.',
          HttpStatus.FORBIDDEN,
        );
      }

      if (current.status !== 'pending') {
        await this.recordFailure(
          statusAction(nextStatus),
          user.userId,
          'already_processed',
          requestId,
        );
        throw new AppError(
          ErrorCode.Conflict,
          'Friend request has already been processed.',
          HttpStatus.CONFLICT,
        );
      }

      const [updated] = await tx.$queryRaw<FriendshipRecord[]>`
        UPDATE friendships
        SET status = ${nextStatus}, updated_at = NOW()
        WHERE id = ${friendshipId}::uuid
        RETURNING
          id,
          requester_id AS "requesterId",
          addressee_id AS "addresseeId",
          status,
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `;

      if (nextStatus === 'accepted') {
        await this.createOrReuseDirectConversation(tx, updated.requesterId, updated.addresseeId);
      }

      events.audit({
        action: statusAction(nextStatus),
        actorId: user.userId,
        requestId,
        result: 'success',
        targetId: updated.id,
        targetType: 'friendship',
      });

      if (nextStatus === 'accepted') {
        const notification = await this.notificationsService.createNotification(tx, {
          contentPreview: 'Friend request accepted',
          dedupeKey: `friendship:${updated.id}:accepted`,
          sourceId: updated.id,
          sourceType: 'friendship',
          type: 'friend_request',
          userId: updated.requesterId,
        });

        if (notification.created) {
          this.notificationsService.publishCreated(events, notification.notification, requestId);
        }
      }

      return updated.id;
    });

    return this.getFriendshipSummary(updatedFriendshipId, user.userId);
  }

  private async getFriendshipForUpdate(
    tx: RawSqlExecutor,
    friendshipId: string,
  ): Promise<FriendshipRecord | null> {
    const [friendship] = await tx.$queryRaw<FriendshipRecord[]>`
      SELECT
        id,
        requester_id AS "requesterId",
        addressee_id AS "addresseeId",
        status,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM friendships
      WHERE id = ${friendshipId}::uuid
      FOR UPDATE
    `;

    return friendship ?? null;
  }

  private async createOrReuseDirectConversation(
    tx: RawSqlExecutor,
    userA: string,
    userB: string,
  ): Promise<DirectConversationRecord> {
    const [participantAId, participantBId] = orderedPair(userA, userB);
    const [conversation] = await tx.$queryRaw<DirectConversationRecord[]>`
      INSERT INTO direct_conversations (id, participant_a_id, participant_b_id)
      VALUES (${randomUUID()}::uuid, ${participantAId}::uuid, ${participantBId}::uuid)
      ON CONFLICT (participant_a_id, participant_b_id)
      DO UPDATE SET updated_at = direct_conversations.updated_at
      RETURNING
        id,
        participant_a_id AS "participantAId",
        participant_b_id AS "participantBId",
        last_message_id AS "lastMessageId"
    `;

    await tx.$executeRaw`
      INSERT INTO read_states (id, user_id, scope_type, conversation_id, last_read_message_id, unread_count)
      VALUES
        (gen_random_uuid(), ${participantAId}::uuid, 'dm', ${conversation.id}::uuid, null, 0),
        (gen_random_uuid(), ${participantBId}::uuid, 'dm', ${conversation.id}::uuid, null, 0)
      ON CONFLICT (user_id, conversation_id) DO NOTHING
    `;

    return conversation;
  }

  private async getFriendshipSummary(
    friendshipId: string,
    currentUserId: string,
  ): Promise<FriendshipSummary> {
    const [row] = await this.prisma.$queryRaw<FriendshipRow[]>`
      SELECT
        f.id AS "friendshipId",
        f.requester_id AS "requesterId",
        f.addressee_id AS "addresseeId",
        f.status,
        dc.id AS "conversationId",
        other_user.id AS "friendId",
        other_user.username AS "friendUsername",
        other_user.nickname AS "friendNickname",
        other_user.avatar_attachment_id AS "friendAvatarAttachmentId",
        other_user.bio AS "friendBio",
        other_user.account_status AS "friendAccountStatus",
        other_user.presence_status AS "friendPresenceStatus",
        other_user.created_at AS "friendCreatedAt"
      FROM friendships f
      INNER JOIN users other_user
        ON other_user.id = CASE
          WHEN f.requester_id = ${currentUserId}::uuid THEN f.addressee_id
          ELSE f.requester_id
        END
      LEFT JOIN direct_conversations dc
        ON dc.participant_a_id = LEAST(f.requester_id, f.addressee_id)
       AND dc.participant_b_id = GREATEST(f.requester_id, f.addressee_id)
      WHERE f.id = ${friendshipId}::uuid
      LIMIT 1
    `;

    if (!row) {
      throw new AppError(
        ErrorCode.ResourceNotFound,
        'Friendship was not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    return toFriendshipSummary(row, currentUserId);
  }

  private async resolveFriendTarget(dto: CreateFriendRequestDto): Promise<FriendUserRow | null> {
    if (dto.target_user_id) {
      return this.getUserForFriend(dto.target_user_id);
    }

    const username = normalizeUsername(dto.target_username ?? '');
    return this.getUserForFriendByUsername(username);
  }

  private async getUserForFriend(userId: string): Promise<FriendUserRow | null> {
    const [user] = await this.prisma.$queryRaw<FriendUserRow[]>`
      SELECT
        id AS "friendId",
        username AS "friendUsername",
        nickname AS "friendNickname",
        avatar_attachment_id AS "friendAvatarAttachmentId",
        bio AS "friendBio",
        account_status AS "friendAccountStatus",
        presence_status AS "friendPresenceStatus",
        created_at AS "friendCreatedAt"
      FROM users
      WHERE id = ${userId}::uuid
        AND account_status = 'active'
      LIMIT 1
    `;

    return user ?? null;
  }

  private async getUserForFriendByUsername(username: string): Promise<FriendUserRow | null> {
    const [user] = await this.prisma.$queryRaw<FriendUserRow[]>`
      SELECT
        id AS "friendId",
        username AS "friendUsername",
        nickname AS "friendNickname",
        avatar_attachment_id AS "friendAvatarAttachmentId",
        bio AS "friendBio",
        account_status AS "friendAccountStatus",
        presence_status AS "friendPresenceStatus",
        created_at AS "friendCreatedAt"
      FROM users
      WHERE username = ${username}
        AND account_status = 'active'
      LIMIT 1
    `;

    return user ?? null;
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
      targetType: 'friendship',
    });
  }
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function orderedPair(userA: string, userB: string): [string, string] {
  return userA < userB ? [userA, userB] : [userB, userA];
}

function statusAction(status: 'accepted' | 'rejected'): string {
  return status === 'accepted' ? 'AcceptFriendRequest' : 'RejectFriendRequest';
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'P2002' || error.code === 'P2010' || error.code === '23505')
  );
}
