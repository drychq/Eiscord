import { randomUUID } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';

import { ErrorCode } from '@eiscord/shared';

import { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
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
  friends: unknown[];
  notifications: unknown[];
  refresh_token: string;
  servers: unknown[];
  unread: unknown[];
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

      throw new AppError(ErrorCode.AuthRequired, 'Refresh token is invalid.', HttpStatus.UNAUTHORIZED);
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

  private buildLoginResponse(user: UserRecord, sessionId: string, refreshToken: string): LoginUserResponse {
    return {
      access_token: this.tokenService.createAccessToken({
        accountStatus: toAccountStatus(user.accountStatus),
        sessionId,
        userId: user.id,
      }),
      friends: [],
      notifications: [],
      refresh_token: refreshToken,
      servers: [],
      unread: [],
      user: toUserSummary(user),
    };
  }

  private async recordLoginFailure(actorId: string | undefined, reason: string, requestId?: string) {
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
  return new AppError(ErrorCode.InvalidCredentials, 'Invalid credentials.', HttpStatus.UNAUTHORIZED);
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
