import { createHash } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { ErrorCode } from '@eiscord/shared';

import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MailerService } from '../mailer/mailer.service';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';

const TTL_MINUTES = 15;
const COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

describe('PasswordResetService', () => {
  let auditService: jest.Mocked<AuditService>;
  let mailerService: jest.Mocked<MailerService>;
  let passwordService: PasswordService;
  let prisma: {
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let service: PasswordResetService;

  beforeEach(() => {
    auditService = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditService>;
    mailerService = {
      sendPasswordResetCode: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MailerService>;
    passwordService = new PasswordService();
    prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn(),
      $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(prisma),
      ),
    };

    const configValues: Record<string, number> = {
      PASSWORD_RESET_MAX_ATTEMPTS: MAX_ATTEMPTS,
      PASSWORD_RESET_RESEND_COOLDOWN_SECONDS: COOLDOWN_SECONDS,
      PASSWORD_RESET_TTL_MINUTES: TTL_MINUTES,
    };

    const config = {
      get: (key: string) => configValues[key],
    } as unknown as ConfigService;

    service = new PasswordResetService(
      auditService,
      config,
      mailerService,
      passwordService,
      prisma as unknown as PrismaService,
    );
  });

  describe('forgotPassword', () => {
    it('returns generic success when email is malformed without hitting DB', async () => {
      const result = await service.forgotPassword({ email: 'not-an-email' }, 'req-1');

      expect(result).toEqual({ message: '若邮箱已注册，验证码已发送至该邮箱' });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(mailerService.sendPasswordResetCode).not.toHaveBeenCalled();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ForgotPassword',
          failureReason: 'invalid_email_format',
          result: 'success',
        }),
      );
    });

    it('returns generic success when user does not exist (no enumeration)', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);

      const result = await service.forgotPassword({ email: 'ghost@example.com' }, 'req-2');

      expect(result).toEqual({ message: '若邮箱已注册，验证码已发送至该邮箱' });
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(mailerService.sendPasswordResetCode).not.toHaveBeenCalled();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ForgotPassword',
          failureReason: 'user_not_found',
          result: 'success',
        }),
      );
    });

    it('generates OTP, persists hash with TTL, sends email, audits sent', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          accountStatus: 'active',
          emailOrPhone: 'alice@example.com',
          id: 'user-1',
          nickname: 'Alice',
          passwordResetAttempts: 0,
          passwordResetCodeHash: null,
          passwordResetExpiresAt: null,
        },
      ]);

      const result = await service.forgotPassword({ email: 'Alice@Example.com' }, 'req-3');

      expect(result).toEqual({ message: '若邮箱已注册，验证码已发送至该邮箱' });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(mailerService.sendPasswordResetCode).toHaveBeenCalledTimes(1);
      const mailCall = mailerService.sendPasswordResetCode.mock.calls[0][0];
      expect(mailCall.to).toBe('alice@example.com');
      expect(mailCall.nickname).toBe('Alice');
      expect(mailCall.expiresInMinutes).toBe(TTL_MINUTES);
      expect(mailCall.code).toMatch(/^\d{6}$/);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ForgotPassword',
          actorId: 'user-1',
          failureReason: 'sent',
          result: 'success',
        }),
      );
    });

    it('blocks resend during cooldown window', async () => {
      const aFewSecondsAgo = new Date(Date.now() + TTL_MINUTES * 60_000 - 5_000);
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          accountStatus: 'active',
          emailOrPhone: 'alice@example.com',
          id: 'user-1',
          nickname: 'Alice',
          passwordResetAttempts: 0,
          passwordResetCodeHash: 'existing-hash',
          passwordResetExpiresAt: aFewSecondsAgo,
        },
      ]);

      const result = await service.forgotPassword({ email: 'alice@example.com' }, 'req-4');

      expect(result).toEqual({ message: '若邮箱已注册，验证码已发送至该邮箱' });
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(mailerService.sendPasswordResetCode).not.toHaveBeenCalled();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ForgotPassword',
          failureReason: 'cooldown_blocked',
          result: 'success',
        }),
      );
    });

    it('returns generic success even when mail dispatch fails (does not leak SMTP state)', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          accountStatus: 'active',
          emailOrPhone: 'alice@example.com',
          id: 'user-1',
          nickname: 'Alice',
          passwordResetAttempts: 0,
          passwordResetCodeHash: null,
          passwordResetExpiresAt: null,
        },
      ]);
      mailerService.sendPasswordResetCode.mockRejectedValueOnce(new Error('SMTP down'));

      const result = await service.forgotPassword({ email: 'alice@example.com' }, 'req-5');

      expect(result).toEqual({ message: '若邮箱已注册，验证码已发送至该邮箱' });
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ForgotPassword',
          failureReason: 'mail_send_failed',
          result: 'failure',
        }),
      );
    });
  });

  describe('resetPassword', () => {
    const validInput = {
      code: '123456',
      email: 'alice@example.com',
      new_password: 'NewPassword1',
    };

    it('rejects weak passwords with ValidationFailed before any DB lookup', async () => {
      await expect(
        service.resetPassword({ ...validInput, new_password: 'weak' }, 'req-6'),
      ).rejects.toMatchObject<AppError>({ code: ErrorCode.ValidationFailed });

      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('returns same generic TokenInvalid error for unknown user as for wrong code', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([]);

      await expect(service.resetPassword(validInput, 'req-7')).rejects.toMatchObject<AppError>({
        code: ErrorCode.PasswordResetTokenInvalid,
      });
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ResetPassword',
          failureReason: 'no_active_token',
          result: 'failure',
        }),
      );
    });

    it('clears reset state and returns TokenInvalid for expired tokens', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          accountStatus: 'active',
          emailOrPhone: 'alice@example.com',
          id: 'user-1',
          nickname: 'Alice',
          passwordResetAttempts: 0,
          passwordResetCodeHash: 'some-hash',
          passwordResetExpiresAt: new Date(Date.now() - 1000),
        },
      ]);

      await expect(service.resetPassword(validInput, 'req-8')).rejects.toMatchObject<AppError>({
        code: ErrorCode.PasswordResetTokenInvalid,
      });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ failureReason: 'expired', result: 'failure' }),
      );
    });

    it('locks the token and returns TooManyAttempts when attempts hit max', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          accountStatus: 'active',
          emailOrPhone: 'alice@example.com',
          id: 'user-1',
          nickname: 'Alice',
          passwordResetAttempts: MAX_ATTEMPTS,
          passwordResetCodeHash: 'some-hash',
          passwordResetExpiresAt: new Date(Date.now() + 60_000),
        },
      ]);

      await expect(service.resetPassword(validInput, 'req-9')).rejects.toMatchObject<AppError>({
        code: ErrorCode.PasswordResetTooManyAttempts,
      });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ failureReason: 'too_many_attempts', result: 'failure' }),
      );
    });

    it('increments attempts and rejects on wrong code', async () => {
      const storedHash = createHash('sha256').update('654321').digest('hex');
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          accountStatus: 'active',
          emailOrPhone: 'alice@example.com',
          id: 'user-1',
          nickname: 'Alice',
          passwordResetAttempts: 0,
          passwordResetCodeHash: storedHash,
          passwordResetExpiresAt: new Date(Date.now() + 60_000),
        },
      ]);

      await expect(service.resetPassword(validInput, 'req-10')).rejects.toMatchObject<AppError>({
        code: ErrorCode.PasswordResetTokenInvalid,
      });
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      const sqlStrings = (prisma.$executeRaw.mock.calls[0][0] as TemplateStringsArray).join(' ');
      expect(sqlStrings).toContain('password_reset_attempts = password_reset_attempts + 1');
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ failureReason: 'invalid_code', result: 'failure' }),
      );
    });

    it('on correct code: writes new password, clears token, revokes sessions in a single transaction', async () => {
      const storedHash = createHash('sha256').update('123456').digest('hex');
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          accountStatus: 'active',
          emailOrPhone: 'alice@example.com',
          id: 'user-1',
          nickname: 'Alice',
          passwordResetAttempts: 2,
          passwordResetCodeHash: storedHash,
          passwordResetExpiresAt: new Date(Date.now() + 60_000),
        },
      ]);

      const result = await service.resetPassword(validInput, 'req-11');

      expect(result).toEqual({ message: '密码已重置，请使用新密码登录' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
      const txSqlStrings = prisma.$executeRaw.mock.calls.map((call) =>
        (call[0] as TemplateStringsArray).join(' '),
      );
      expect(txSqlStrings.some((s) => s.includes('password_hash ='))).toBe(true);
      expect(txSqlStrings.some((s) => s.includes('password_reset_code_hash = NULL'))).toBe(true);
      expect(txSqlStrings.some((s) => s.includes('UPDATE auth_sessions'))).toBe(true);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ResetPassword',
          actorId: 'user-1',
          result: 'success',
        }),
      );
    });
  });
});
