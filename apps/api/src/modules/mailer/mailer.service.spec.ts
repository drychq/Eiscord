import { ConfigService } from '@nestjs/config';

const sendMock = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

import { Resend } from 'resend';
import { MailerService } from './mailer.service';

const ResendMock = Resend as unknown as jest.Mock;

describe('MailerService', () => {
  let mailer: MailerService;

  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'mocked' }, error: null });
    ResendMock.mockClear();

    const configValues: Record<string, string> = {
      MAIL_FROM_EMAIL: 'noreply@eiscord.test',
      MAIL_FROM_NAME: 'Eiscord',
      RESEND_API_KEY: 're_test_key',
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

    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0][0] as {
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

  it('lazy-initializes the Resend client exactly once across multiple sends', async () => {
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

    expect(ResendMock).toHaveBeenCalledTimes(1);
    expect(ResendMock).toHaveBeenCalledWith('re_test_key');
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('propagates and logs errors returned by Resend', async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'invalid recipient', name: 'validation_error' },
    });

    await expect(
      mailer.sendPasswordResetCode({
        code: '999999',
        expiresInMinutes: 15,
        nickname: 'Charlie',
        to: 'c@example.com',
      }),
    ).rejects.toThrow('invalid recipient');
  });
});
