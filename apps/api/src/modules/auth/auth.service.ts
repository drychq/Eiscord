import { randomUUID } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';

import { ErrorCode } from '@eiscord/shared';

import { AuthenticatedUserContext } from '../../core/auth/auth.types';
import { AppError } from '../../core/errors/app-error';
import { PrismaService } from '../../infra/persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  FriendshipRow,
  FriendshipSummary,
  toFriendshipSummary,
} from '../friends/friends.presenter';
import {
  NotificationRow,
  NotificationSummary,
  toNotificationSummary,
} from '../notifications/notifications.presenter';
import { ReadStateRow, ReadStateSummary, toReadStateSummary } from '../messages/messages.presenter';
import { ServerListRow, ServerSummary, toServerSummary } from '../servers/servers.presenter';
import { toUserSummary, UserRecord, UserSummary } from '../users/user.presenter';
import { LoginUserDto } from './dto/login-user.dto';
import { RefreshSessionDto } from './dto/refresh-session.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

export type RegisterUserResponse = {
  account_status: string;
  user_id: string;
};

export type LoginUserResponse = {
  access_token: string;
  friends: FriendshipSummary[];
  notifications: NotificationSummary[];
  refresh_token: string;
  servers: ServerSummary[];
  unread: ReadStateSummary[];
  user: UserSummary;
};

type AuthSessionRecord = {
  expiresAt: Date;
  id: string;
  revokedAt: Date | null;
  userId: string;
};

type SessionUserRow = UserRecord & {
  sessionExpiresAt: Date;
  sessionId: string;
  sessionRevokedAt: Date | null;
  sessionUserId: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly auditService: AuditService,
    private readonly passwordService: PasswordService,
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async register(dto: RegisterUserDto, requestId?: string): Promise<RegisterUserResponse> {
    const username = normalizeUsername(dto.username);
    const emailOrPhone = normalizeEmailOrPhone(dto.email_or_phone);

    if (!this.passwordService.isStrongPassword(dto.password)) {
      await this.auditService.record({
        action: 'RegisterUser',
        failureReason: 'weak_password',
        requestId,
        result: 'failure',
      });

      throw new AppError(
        ErrorCode.ValidationFailed,
        'Password must be at least 8 characters and include letters and numbers.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const userId = randomUUID();
      const [user] = await this.prisma.$queryRaw<UserRecord[]>`
        INSERT INTO users (
          id,
          username,
          email_or_phone,
          password_hash,
          nickname,
          account_status,
          presence_status
        )
        VALUES (
          ${userId}::uuid,
          ${username},
          ${emailOrPhone},
          ${this.passwordService.hashPassword(dto.password)},
          ${username},
          'active',
          'offline'
        )
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
        action: 'RegisterUser',
        actorId: user.id,
        requestId,
        result: 'success',
        targetId: user.id,
        targetType: 'user',
      });

      return {
        account_status: user.accountStatus,
        user_id: user.id,
      };
    } catch (error) {
      if (isUniqueConflict(error)) {
        await this.auditService.record({
          action: 'RegisterUser',
          failureReason: 'duplicate_identity',
          requestId,
          result: 'failure',
          targetType: 'user',
        });

        throw new AppError(
          ErrorCode.Conflict,
          'Username or contact is already registered.',
          HttpStatus.CONFLICT,
        );
      }

      throw error;
    }
  }

  async login(dto: LoginUserDto, requestId?: string): Promise<LoginUserResponse> {
    const loginIdentifier = normalizeEmailOrPhone(dto.login_identifier);
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
      WHERE username = ${normalizeUsername(dto.login_identifier)}
        OR email_or_phone = ${loginIdentifier}
      LIMIT 1
    `;

    if (!user || !this.passwordService.verifyPassword(dto.password, user.passwordHash)) {
      await this.recordLoginFailure(user?.id, 'invalid_credentials', requestId);
      throw invalidCredentialsError();
    }

    if (user.accountStatus !== 'active') {
      await this.recordLoginFailure(user.id, `account_${user.accountStatus}`, requestId);
      throw new AppError(ErrorCode.AuthRequired, 'Account is not active.', HttpStatus.UNAUTHORIZED);
    }

    const refreshToken = this.tokenService.createRefreshToken();
    const sessionId = randomUUID();
    const [session] = await this.prisma.$queryRaw<AuthSessionRecord[]>`
      INSERT INTO auth_sessions (
        id,
        user_id,
        refresh_token_hash,
        client_device_name,
        client_timezone,
        expires_at
      )
      VALUES (
        ${sessionId}::uuid,
        ${user.id}::uuid,
        ${this.tokenService.hashRefreshToken(refreshToken)},
        ${dto.client?.device_name ?? null},
        ${dto.client?.timezone ?? null},
        ${this.tokenService.getRefreshExpiresAt()}
      )
      RETURNING
        id,
        user_id AS "userId",
        expires_at AS "expiresAt",
        revoked_at AS "revokedAt"
    `;

    await this.auditService.record({
      action: 'LoginUser',
      actorId: user.id,
      requestId,
      result: 'success',
      targetId: session.id,
      targetType: 'auth_session',
    });

    return this.buildLoginResponse(user, session.id, refreshToken);
  }

  async refresh(dto: RefreshSessionDto, requestId?: string): Promise<LoginUserResponse> {
    const refreshTokenHash = this.tokenService.hashRefreshToken(dto.refresh_token);
    const [sessionRow] = await this.prisma.$queryRaw<SessionUserRow[]>`
      SELECT
        s.id AS "sessionId",
        s.user_id AS "sessionUserId",
        s.expires_at AS "sessionExpiresAt",
        s.revoked_at AS "sessionRevokedAt",
        u.id,
        u.username,
        u.email_or_phone AS "emailOrPhone",
        u.password_hash AS "passwordHash",
        u.nickname,
        u.avatar_attachment_id AS "avatarAttachmentId",
        u.bio,
        u.account_status AS "accountStatus",
        u.presence_status AS "presenceStatus",
        u.created_at AS "createdAt"
      FROM auth_sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.refresh_token_hash = ${refreshTokenHash}
      LIMIT 1
    `;

    if (!sessionRow || sessionRow.sessionRevokedAt || sessionRow.sessionExpiresAt <= new Date()) {
      await this.auditService.record({
        action: 'RefreshSession',
        failureReason: 'invalid_or_expired_refresh_token',
        requestId,
        result: 'failure',
        targetType: 'auth_session',
      });

      throw new AppError(
        ErrorCode.AuthRequired,
        'Refresh token is invalid.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (sessionRow.accountStatus !== 'active') {
      await this.prisma.$executeRaw`
        UPDATE auth_sessions
        SET revoked_at = NOW(), updated_at = NOW()
        WHERE id = ${sessionRow.sessionId}::uuid
      `;

      await this.auditService.record({
        action: 'RefreshSession',
        actorId: sessionRow.id,
        failureReason: `account_${sessionRow.accountStatus}`,
        requestId,
        result: 'failure',
        targetId: sessionRow.sessionId,
        targetType: 'auth_session',
      });

      throw new AppError(ErrorCode.AuthRequired, 'Account is not active.', HttpStatus.UNAUTHORIZED);
    }

    const nextRefreshToken = this.tokenService.createRefreshToken();
    await this.prisma.$executeRaw`
      UPDATE auth_sessions
      SET
        expires_at = ${this.tokenService.getRefreshExpiresAt()},
        last_used_at = NOW(),
        refresh_token_hash = ${this.tokenService.hashRefreshToken(nextRefreshToken)},
        updated_at = NOW()
      WHERE id = ${sessionRow.sessionId}::uuid
    `;

    await this.auditService.record({
      action: 'RefreshSession',
      actorId: sessionRow.id,
      requestId,
      result: 'success',
      targetId: sessionRow.sessionId,
      targetType: 'auth_session',
    });

    return this.buildLoginResponse(sessionRow, sessionRow.sessionId, nextRefreshToken);
  }

  async logout(user: AuthenticatedUserContext, requestId?: string): Promise<{ ok: true }> {
    await this.prisma.$executeRaw`
      UPDATE auth_sessions
      SET revoked_at = NOW(), updated_at = NOW()
      WHERE id = ${user.sessionId}::uuid
        AND user_id = ${user.userId}::uuid
        AND revoked_at IS NULL
    `;

    await this.auditService.record({
      action: 'LogoutUser',
      actorId: user.userId,
      requestId,
      result: 'success',
      targetId: user.sessionId,
      targetType: 'auth_session',
    });

    return { ok: true };
  }

  private async buildLoginResponse(
    user: UserRecord,
    sessionId: string,
    refreshToken: string,
  ): Promise<LoginUserResponse> {
    const [friends, servers, notifications, unread] = await Promise.all([
      this.listFriendSummaries(user.id),
      this.listServerSummaries(user.id),
      this.listNotificationSummaries(user.id),
      this.listUnreadSummaries(user.id),
    ]);

    return {
      access_token: this.tokenService.createAccessToken({
        accountStatus: toAccountStatus(user.accountStatus),
        sessionId,
        userId: user.id,
      }),
      friends,
      notifications,
      refresh_token: refreshToken,
      servers,
      unread,
      user: toUserSummary(user),
    };
  }

  private async listFriendSummaries(userId: string): Promise<FriendshipSummary[]> {
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
          WHEN f.requester_id = ${userId}::uuid THEN f.addressee_id
          ELSE f.requester_id
        END
      LEFT JOIN direct_conversations dc
        ON dc.participant_a_id = LEAST(f.requester_id, f.addressee_id)
       AND dc.participant_b_id = GREATEST(f.requester_id, f.addressee_id)
      WHERE (f.requester_id = ${userId}::uuid OR f.addressee_id = ${userId}::uuid)
        AND f.status IN ('pending', 'accepted', 'rejected')
      ORDER BY f.updated_at DESC
    `;

    return rows.map((row) => toFriendshipSummary(row, userId));
  }

  private async listServerSummaries(userId: string): Promise<ServerSummary[]> {
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
      WHERE m.user_id = ${userId}::uuid
        AND m.member_status IN ('active', 'muted')
        AND s.status = 'active'
      ORDER BY m.joined_at DESC
    `;

    return rows.map(toServerSummary);
  }

  private async listNotificationSummaries(userId: string): Promise<NotificationSummary[]> {
    const rows = await this.prisma.$queryRaw<NotificationRow[]>`
      SELECT
        id,
        user_id AS "userId",
        type,
        source_type AS "sourceType",
        source_id AS "sourceId",
        content_preview AS "contentPreview",
        is_read AS "isRead",
        dedupe_key AS "dedupeKey",
        created_at AS "createdAt",
        read_at AS "readAt"
      FROM notifications
      WHERE user_id = ${userId}::uuid
        AND is_read = false
      ORDER BY created_at DESC
      LIMIT 20
    `;

    return rows.map(toNotificationSummary);
  }

  private async listUnreadSummaries(userId: string): Promise<ReadStateSummary[]> {
    const rows = await this.prisma.$queryRaw<ReadStateRow[]>`
      SELECT
        user_id AS "userId",
        scope_type AS "scopeType",
        channel_id AS "channelId",
        conversation_id AS "conversationId",
        last_read_message_id AS "lastReadMessageId",
        unread_count AS "unreadCount",
        updated_at AS "updatedAt"
      FROM read_states
      WHERE user_id = ${userId}::uuid
        AND unread_count > 0
      ORDER BY updated_at DESC
      LIMIT 100
    `;

    return rows.map(toReadStateSummary);
  }

  private async recordLoginFailure(
    actorId: string | undefined,
    reason: string,
    requestId?: string,
  ) {
    await this.auditService.record({
      action: 'LoginUser',
      actorId,
      failureReason: reason,
      requestId,
      result: 'failure',
      targetId: actorId,
      targetType: actorId ? 'user' : undefined,
    });
  }
}

function invalidCredentialsError(): AppError {
  return new AppError(
    ErrorCode.InvalidCredentials,
    'Invalid credentials.',
    HttpStatus.UNAUTHORIZED,
  );
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeEmailOrPhone(value: string): string {
  return value.trim().toLowerCase();
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'P2002' || error.code === 'P2010')
  );
}

function toAccountStatus(value: string): AuthenticatedUserContext['accountStatus'] {
  if (value === 'active' || value === 'pending_verification' || value === 'disabled') {
    return value;
  }

  return 'disabled';
}
