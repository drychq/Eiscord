import { HttpStatus, Injectable } from '@nestjs/common';

import { ErrorCode } from '@eiscord/shared';

import { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PresenceService } from '../realtime/presence.service';
import { SearchUsersDto } from './dto/search-users.dto';
import { UpdatePresenceDto } from './dto/update-presence.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import {
  toUserSearchResult,
  toUserSummary,
  UserRecord,
  UserSearchResult,
  UserSearchRow,
  UserSummary,
} from './user.presenter';

type AttachmentLookupRow = {
  id: string;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly auditService: AuditService,
    private readonly presenceService: PresenceService,
    private readonly prisma: PrismaService,
  ) {}

  async getCurrentUser(user: AuthenticatedUserContext): Promise<UserSummary> {
    const [found] = await this.prisma.$queryRaw<UserRecord[]>`
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
        created_at AS "createdAt"
      FROM users
      WHERE id = ${user.userId}::uuid
      LIMIT 1
    `;

    if (!found) {
      throw new AppError(ErrorCode.AuthRequired, 'Authenticated user no longer exists.', HttpStatus.UNAUTHORIZED);
    }

    return toUserSummary(found);
  }

  async searchUsers(
    user: AuthenticatedUserContext,
    dto: SearchUsersDto,
  ): Promise<UserSearchResult[]> {
    const query = dto.q.trim().toLowerCase();

    if (query.length < 2) {
      return [];
    }

    const containsPattern = `%${escapeLike(query)}%`;
    const prefixPattern = `${escapeLike(query)}%`;
    const limit = dto.limit ?? 10;
    const rows = await this.prisma.$queryRaw<UserSearchRow[]>`
      SELECT
        u.id,
        u.username,
        u.nickname,
        u.avatar_attachment_id AS "avatarAttachmentId",
        u.bio,
        u.account_status AS "accountStatus",
        u.presence_status AS "presenceStatus",
        u.created_at AS "createdAt",
        CASE
          WHEN u.id = ${user.userId}::uuid THEN 'self'
          WHEN active_friendship.status = 'accepted' THEN 'accepted'
          WHEN active_friendship.status = 'pending'
            AND active_friendship.requester_id = ${user.userId}::uuid THEN 'pending_outgoing'
          WHEN active_friendship.status = 'pending'
            AND active_friendship.addressee_id = ${user.userId}::uuid THEN 'pending_incoming'
          ELSE 'none'
        END AS "relationshipStatus"
      FROM users u
      LEFT JOIN LATERAL (
        SELECT requester_id, addressee_id, status
        FROM friendships f
        WHERE (
            (f.requester_id = ${user.userId}::uuid AND f.addressee_id = u.id)
            OR (f.addressee_id = ${user.userId}::uuid AND f.requester_id = u.id)
          )
          AND f.status IN ('pending', 'accepted')
        ORDER BY f.updated_at DESC
        LIMIT 1
      ) active_friendship ON true
      WHERE u.account_status = 'active'
        AND (
          lower(u.username) LIKE ${containsPattern} ESCAPE '\\'
          OR lower(u.nickname) LIKE ${containsPattern} ESCAPE '\\'
        )
      ORDER BY
        CASE
          WHEN lower(u.username) = ${query} THEN 0
          WHEN lower(u.username) LIKE ${prefixPattern} ESCAPE '\\' THEN 1
          WHEN lower(u.nickname) LIKE ${prefixPattern} ESCAPE '\\' THEN 2
          ELSE 3
        END,
        lower(u.username) ASC
      LIMIT ${limit}
    `;

    return rows.map(toUserSearchResult);
  }

  async updateProfile(
    user: AuthenticatedUserContext,
    dto: UpdateProfileDto,
    requestId?: string,
  ): Promise<UserSummary> {
    const current = await this.getUserRecord(user.userId);

    if (!current) {
      throw new AppError(ErrorCode.AuthRequired, 'Authenticated user no longer exists.', HttpStatus.UNAUTHORIZED);
    }

    if (dto.avatar_attachment_id) {
      const [attachment] = await this.prisma.$queryRaw<AttachmentLookupRow[]>`
        SELECT id
        FROM attachments
        WHERE id = ${dto.avatar_attachment_id}::uuid
          AND owner_id = ${user.userId}::uuid
          AND purpose = 'avatar'
          AND status = 'ready'
        LIMIT 1
      `;

      if (!attachment) {
        await this.auditService.record({
          action: 'UpdateProfile',
          actorId: user.userId,
          failureReason: 'invalid_avatar_attachment',
          requestId,
          result: 'failure',
          targetId: dto.avatar_attachment_id,
          targetType: 'attachment',
        });

        throw new AppError(
          ErrorCode.ResourceNotFound,
          'Avatar attachment was not found.',
          HttpStatus.NOT_FOUND,
        );
      }
    }

    const nextNickname = dto.nickname !== undefined ? dto.nickname.trim() : current.nickname;

    if (nextNickname.length === 0) {
      throw new AppError(ErrorCode.ValidationFailed, 'Nickname cannot be empty.', HttpStatus.BAD_REQUEST);
    }

    const nextAvatarAttachmentId =
      dto.avatar_attachment_id !== undefined ? dto.avatar_attachment_id : current.avatarAttachmentId;
    const nextBio = dto.bio !== undefined ? normalizeNullableText(dto.bio) : current.bio;
    const [updated] = await this.prisma.$queryRaw<UserRecord[]>`
      UPDATE users
      SET
        nickname = ${nextNickname},
        avatar_attachment_id = ${nextAvatarAttachmentId}::uuid,
        bio = ${nextBio},
        updated_at = NOW()
      WHERE id = ${user.userId}::uuid
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
        created_at AS "createdAt"
    `;

    await this.auditService.record({
      action: 'UpdateProfile',
      actorId: user.userId,
      requestId,
      result: 'success',
      targetId: user.userId,
      targetType: 'user',
    });

    return toUserSummary(updated);
  }

  async updatePresence(
    user: AuthenticatedUserContext,
    dto: UpdatePresenceDto,
    requestId?: string,
  ): Promise<UserSummary> {
    const summary = await this.presenceService.updatePresence(
      user,
      dto.desired_status,
      requestId,
    );

    await this.auditService.record({
      action: 'UpdatePresence',
      actorId: user.userId,
      requestId,
      result: 'success',
      targetId: user.userId,
      targetType: 'user',
    });

    return summary;
  }

  private async getUserRecord(userId: string): Promise<UserRecord | null> {
    const [user] = await this.prisma.$queryRaw<UserRecord[]>`
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
        created_at AS "createdAt"
      FROM users
      WHERE id = ${userId}::uuid
      LIMIT 1
    `;

    return user ?? null;
  }
}

function normalizeNullableText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
