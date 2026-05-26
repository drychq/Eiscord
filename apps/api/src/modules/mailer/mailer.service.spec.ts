import { ConfigService } from '@nestjs/config';

const sendMailMock = jest.fn();
const createTransportMock = jest.fn(() => ({ sendMail: sendMailMock }));

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => createTransportMock(...args),
}));

import { MailerService } from './mailer.service';

describe('MailerService', () => {
  let mailer: MailerService;

  beforeEach(() => {
    sendMailMock.mockReset();
    sendMailMock.mockResolvedValue({ messageId: 'mocked' });
    createTransportMock.mockClear();

    const configValues: Record<string, string | number> = {
      SMTP_FROM_EMAIL: 'noreply@eiscord.test',
      SMTP_FROM_NAME: 'Eiscord',
      SMTP_HOST: 'localhost',
      SMTP_PASSWORD: '',
      SMTP_PORT: 1025,
      SMTP_USER: '',
    };

    const config = {
      get: (key: string) => configValues[key],
    } as unknown as ConfigService;

    mailer = new MailerService(config);
  });

  it('sends password reset email with subject, recipient, code and HTML-escaped nickname', async () => {
    await mailer.sendPasswordResetCode({
      code: '123456',
      expiresInMinutes: 15,
      nickname: '<User & Co>',
      to: 'user@example.com',
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const payload = sendMailMock.mock.calls[0][0] as {
      from: string;
      html: string;
      subject: string;
      to: string;
    };
    expect(payload.to).toBe('user@example.com');
    expect(payload.subject).toBe('Eiscord 密码重置验证码');
    expect(payload.from).toBe('"Eiscord" <noreply@eiscord.test>');
    expect(payload.html).toContain('123456');
    expect(payload.html).toContain('15 分钟内有效');
    expect(payload.html).toContain('&lt;User &amp; Co&gt;');
    expect(payload.html).not.toContain('<User & Co>');
  });

  it('lazy-initializes the transporter exactly once across multiple sends', async () => {
    await mailer.sendPasswordResetCode({
      code: '111111',
      expiresInMinutes: 15,
      nickname: 'Alice',
      to: 'a@example.com',
    });
    await mailer.sendPasswordResetCode({
      code: '222222',
      expiresInMinutes: 15,
      nickname: 'Bob',
      to: 'b@example.com',
    });

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(createTransportMock).toHaveBeenCalledWith({
      auth: undefined,
      host: 'localhost',
      port: 1025,
      secure: false,
    });
    expect(sendMailMock).toHaveBeenCalledTimes(2);
  });

  it('propagates and logs SMTP errors', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('connection refused'));

    await expect(
      mailer.sendPasswordResetCode({
        code: '999999',
        expiresInMinutes: 15,
        nickname: 'Charlie',
        to: 'c@example.com',
      }),
    ).rejects.toThrow('connection refused');
  });
});
