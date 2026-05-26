import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ErrorCode } from '@eiscord/shared';

import type { Environment } from '../../common/config/env.validation';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../mailer/mailer.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PasswordService } from './password.service';

const GENERIC_FORGOT_MESSAGE = '若邮箱已注册，验证码已发送至该邮箱';
const RESET_SUCCESS_MESSAGE = '密码已重置，请使用新密码登录';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_CODE_PATTERN = /^\d{6}$/;

type PasswordResetUserRow = {
  accountStatus: string;
  emailOrPhone: string;
  id: string;
  nickname: string;
  passwordResetAttempts: number;
  passwordResetCodeHash: string | null;
  passwordResetExpiresAt: Date | null;
};

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly auditService: AuditService,
    private readonly configService: ConfigService<Environment, true>,
    private readonly mailerService: MailerService,
    private readonly passwordService: PasswordService,
    private readonly prisma: PrismaService,
  ) {}

  async forgotPassword(
    dto: ForgotPasswordDto,
    requestId?: string,
  ): Promise<{ message: string }> {
    const email = normalizeEmail(dto.email);

    if (!isValidEmail(email)) {
      await this.auditService.record({
        action: 'ForgotPassword',
        failureReason: 'invalid_email_format',
        requestId,
        result: 'success',
      });
      return { message: GENERIC_FORGOT_MESSAGE };
    }

    const user = await this.findUserByEmail(email);

    if (!user) {
      await this.auditService.record({
        action: 'ForgotPassword',
        failureReason: 'user_not_found',
        requestId,
        result: 'success',
      });
      return { message: GENERIC_FORGOT_MESSAGE };
    }

    if (user.accountStatus !== 'active') {
      await this.auditService.record({
        action: 'ForgotPassword',
        actorId: user.id,
        failureReason: `account_${user.accountStatus}`,
        requestId,
        result: 'success',
        targetId: user.id,
        targetType: 'user',
      });
      return { message: GENERIC_FORGOT_MESSAGE };
    }

    if (this.isOnCooldown(user.passwordResetExpiresAt)) {
      await this.auditService.record({
        action: 'ForgotPassword',
        actorId: user.id,
        failureReason: 'cooldown_blocked',
        requestId,
        result: 'success',
        targetId: user.id,
        targetType: 'user',
      });
      return { message: GENERIC_FORGOT_MESSAGE };
    }

    const code = generateOtpCode();
    const codeHash = hashOtpCode(code);
    const ttlMinutes = this.getTtlMinutes();
    const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

    await this.prisma.$executeRaw`
      UPDATE users
      SET
        password_reset_code_hash = ${codeHash},
        password_reset_expires_at = ${expiresAt},
        password_reset_attempts = 0,
        updated_at = NOW()
      WHERE id = ${user.id}::uuid
    `;

    try {
      await this.mailerService.sendPasswordResetCode({
        code,
        expiresInMinutes: ttlMinutes,
        nickname: user.nickname,
        to: user.emailOrPhone,
      });

      await this.auditService.record({
        action: 'ForgotPassword',
        actorId: user.id,
        failureReason: 'sent',
        requestId,
        result: 'success',
        targetId: user.id,
        targetType: 'user',
      });
    } catch (error) {
      this.logger.error(
        `Password reset email dispatch failed for user ${user.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.auditService.record({
        action: 'ForgotPassword',
        actorId: user.id,
        failureReason: 'mail_send_failed',
        requestId,
        result: 'failure',
        targetId: user.id,
        targetType: 'user',
      });
    }

    return { message: GENERIC_FORGOT_MESSAGE };
  }

  async resetPassword(
    dto: ResetPasswordDto,
    requestId?: string,
  ): Promise<{ message: string }> {
    if (!this.passwordService.isStrongPassword(dto.new_password)) {
      await this.auditService.record({
        action: 'ResetPassword',
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

    const email = normalizeEmail(dto.email);
    const code = dto.code.trim();

    if (!isValidEmail(email) || !OTP_CODE_PATTERN.test(code)) {
      await this.auditService.record({
        action: 'ResetPassword',
        failureReason: 'invalid_input',
        requestId,
        result: 'failure',
      });
      throw tokenInvalidError();
    }

    const user = await this.findUserByEmail(email);

    if (!user || !user.passwordResetCodeHash || !user.passwordResetExpiresAt) {
      await this.auditService.record({
        action: 'ResetPassword',
        actorId: user?.id,
        failureReason: 'no_active_token',
        requestId,
        result: 'failure',
        targetId: user?.id,
        targetType: user ? 'user' : undefined,
      });
      throw tokenInvalidError();
    }

    if (user.passwordResetExpiresAt.getTime() <= Date.now()) {
      await this.clearResetState(user.id);
      await this.auditService.record({
        action: 'ResetPassword',
        actorId: user.id,
        failureReason: 'expired',
        requestId,
        result: 'failure',
        targetId: user.id,
        targetType: 'user',
      });
      throw tokenInvalidError();
    }

    if (user.passwordResetAttempts >= this.getMaxAttempts()) {
      await this.clearResetState(user.id);
      await this.auditService.record({
        action: 'ResetPassword',
        actorId: user.id,
        failureReason: 'too_many_attempts',
        requestId,
        result: 'failure',
        targetId: user.id,
        targetType: 'user',
      });
      throw new AppError(
        ErrorCode.PasswordResetTooManyAttempts,
        'Too many failed attempts. Please request a new verification code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const submittedHash = Buffer.from(hashOtpCode(code), 'hex');
    const storedHash = Buffer.from(user.passwordResetCodeHash, 'hex');
    const matches =
      submittedHash.length === storedHash.length && timingSafeEqual(submittedHash, storedHash);

    if (!matches) {
      await this.prisma.$executeRaw`
        UPDATE users
        SET password_reset_attempts = password_reset_attempts + 1,
            updated_at = NOW()
        WHERE id = ${user.id}::uuid
      `;
      await this.auditService.record({
        action: 'ResetPassword',
        actorId: user.id,
        failureReason: 'invalid_code',
        requestId,
        result: 'failure',
        targetId: user.id,
        targetType: 'user',
      });
      throw tokenInvalidError();
    }

    const newPasswordHash = this.passwordService.hashPassword(dto.new_password);

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE users
        SET
          password_hash = ${newPasswordHash},
          password_reset_code_hash = NULL,
          password_reset_expires_at = NULL,
          password_reset_attempts = 0,
          updated_at = NOW()
        WHERE id = ${user.id}::uuid
      `;
      await tx.$executeRaw`
        UPDATE auth_sessions
        SET revoked_at = NOW(), updated_at = NOW()
        WHERE user_id = ${user.id}::uuid AND revoked_at IS NULL
      `;
    });

    await this.auditService.record({
      action: 'ResetPassword',
      actorId: user.id,
      requestId,
      result: 'success',
      targetId: user.id,
      targetType: 'user',
    });

    return { message: RESET_SUCCESS_MESSAGE };
  }

  private async findUserByEmail(email: string): Promise<PasswordResetUserRow | undefined> {
    const [row] = await this.prisma.$queryRaw<PasswordResetUserRow[]>`
      SELECT
        id,
        nickname,
        email_or_phone AS "emailOrPhone",
        account_status AS "accountStatus",
        password_reset_code_hash AS "passwordResetCodeHash",
        password_reset_expires_at AS "passwordResetExpiresAt",
        password_reset_attempts AS "passwordResetAttempts"
      FROM users
      WHERE email_or_phone = ${email}
      LIMIT 1
    `;
    return row;
  }

  private async clearResetState(userId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE users
      SET
        password_reset_code_hash = NULL,
        password_reset_expires_at = NULL,
        password_reset_attempts = 0,
        updated_at = NOW()
      WHERE id = ${userId}::uuid
    `;
  }

  private isOnCooldown(expiresAt: Date | null): boolean {
    if (!expiresAt) {
      return false;
    }
    const remainingMs = expiresAt.getTime() - Date.now();
    const ttlMs = this.getTtlMinutes() * 60_000;
    const cooldownMs = this.getResendCooldownSeconds() * 1000;
    return remainingMs > ttlMs - cooldownMs;
  }

  private getTtlMinutes(): number {
    return this.configService.get('PASSWORD_RESET_TTL_MINUTES', { infer: true });
  }

  private getResendCooldownSeconds(): number {
    return this.configService.get('PASSWORD_RESET_RESEND_COOLDOWN_SECONDS', { infer: true });
  }

  private getMaxAttempts(): number {
    return this.configService.get('PASSWORD_RESET_MAX_ATTEMPTS', { infer: true });
  }
}

function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashOtpCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value);
}

function tokenInvalidError(): AppError {
  return new AppError(
    ErrorCode.PasswordResetTokenInvalid,
    'Verification code is invalid or expired.',
    HttpStatus.BAD_REQUEST,
  );
}
