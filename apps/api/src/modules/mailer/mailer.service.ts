import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

import type { Environment } from '../../common/config/env.validation';

export type PasswordResetEmail = {
  code: string;
  expiresInMinutes: number;
  nickname: string;
  to: string;
};

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter?: Transporter;

  constructor(private readonly configService: ConfigService<Environment, true>) {}

  async sendPasswordResetCode(input: PasswordResetEmail): Promise<void> {
    const fromEmail = this.configService.get('SMTP_FROM_EMAIL', { infer: true });
    const fromName = this.configService.get('SMTP_FROM_NAME', { infer: true });

    try {
      await this.getTransporter().sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        html: renderPasswordResetEmail(input),
        subject: 'Eiscord 密码重置验证码',
        to: input.to,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send password reset email to ${input.to}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      const host = this.configService.get('SMTP_HOST', { infer: true });
      const port = this.configService.get('SMTP_PORT', { infer: true });
      const user = this.configService.get('SMTP_USER', { infer: true });
      const password = this.configService.get('SMTP_PASSWORD', { infer: true });

      this.transporter = createTransport({
        auth: user ? { pass: password, user } : undefined,
        host,
        port,
        secure: port === 465,
      });
    }

    return this.transporter;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPasswordResetEmail({
  code,
  expiresInMinutes,
  nickname,
}: PasswordResetEmail): string {
  const safeNickname = escapeHtml(nickname);
  return `<!doctype html>
<html lang="zh-CN">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937;">
  <p>你好 ${safeNickname}，</p>
  <p>你的密码重置验证码是：<strong style="font-size: 22px; letter-spacing: 6px; color: #111;">${code}</strong></p>
  <p>验证码 ${expiresInMinutes} 分钟内有效。如果不是你本人操作，请忽略此邮件并考虑修改密码。</p>
  <p style="color: #6b7280; font-size: 12px; margin-top: 32px;">—— Eiscord 团队</p>
</body>
</html>`;
}
