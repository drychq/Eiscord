import { describe, expect, it } from 'vitest';

import {
  loginRequestSchema,
  loginResponseSchema,
  refreshRequestSchema,
  registerRequestSchema,
  registerResponseSchema,
} from './auth';

describe('auth schemas', () => {
  it('accepts a valid register request', () => {
    expect(() =>
      registerRequestSchema.parse({
        username: 'alice_01',
        email_or_phone: 'alice@example.com',
        password: 'Password1',
      }),
    ).not.toThrow();
  });

  it('rejects a register request with a short username', () => {
    expect(() =>
      registerRequestSchema.parse({
        username: 'al',
        email_or_phone: 'alice@example.com',
        password: 'Password1',
      }),
    ).toThrow();
  });

  it('rejects a register request whose contact is not an email', () => {
    expect(() =>
      registerRequestSchema.parse({
        username: 'alice_01',
        email_or_phone: '13800138000',
        password: 'Password1',
      }),
    ).toThrow();
  });

  it('parses the register response shape returned by /auth/register', () => {
    expect(() =>
      registerResponseSchema.parse({
        user_id: '00000000-0000-4000-8000-000000000001',
        account_status: 'active',
      }),
    ).not.toThrow();
  });

  it('parses the login response envelope returned by /auth/login', () => {
    expect(() =>
      loginResponseSchema.parse({
        access_token: 'access-token',
        refresh_token: 'refresh-token-with-enough-length',
        servers: [],
        friends: [],
        notifications: [],
        unread: [],
        user: {
          account_status: 'active',
          avatar_attachment_id: null,
          bio: null,
          created_at: '2026-05-01T12:00:00.000Z',
          nickname: 'Alice',
          presence_status: 'offline',
          user_id: '00000000-0000-4000-8000-000000000002',
          username: 'alice',
        },
      }),
    ).not.toThrow();
  });

  it('accepts a login request with optional client metadata', () => {
    expect(() =>
      loginRequestSchema.parse({
        login_identifier: 'alice',
        password: 'Password1',
        client: { device_name: 'Chrome 126', timezone: 'Asia/Hong_Kong' },
      }),
    ).not.toThrow();
  });

  it('rejects a refresh request with a short token', () => {
    expect(() => refreshRequestSchema.parse({ refresh_token: 'short' })).toThrow();
  });
});
