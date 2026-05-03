import { describe, expect, it } from 'vitest';

import { updateProfileRequestSchema, userSummarySchema } from './user';

describe('user schemas', () => {
  it('parses a user summary with nullable fields', () => {
    expect(() =>
      userSummarySchema.parse({
        account_status: 'active',
        avatar_attachment_id: null,
        bio: null,
        created_at: '2026-05-01T12:00:00.000Z',
        nickname: 'Alice',
        presence_status: 'offline',
        user_id: '00000000-0000-4000-8000-000000000001',
        username: 'alice',
      }),
    ).not.toThrow();
  });

  it('accepts a partial profile update with only nickname', () => {
    expect(() => updateProfileRequestSchema.parse({ nickname: 'Alice 王' })).not.toThrow();
  });

  it('accepts setting avatar_attachment_id to null to clear it', () => {
    expect(() =>
      updateProfileRequestSchema.parse({ avatar_attachment_id: null }),
    ).not.toThrow();
  });

  it('rejects a profile update with no fields', () => {
    expect(() => updateProfileRequestSchema.parse({})).toThrow();
  });

  it('rejects a bio longer than 280 characters', () => {
    expect(() => updateProfileRequestSchema.parse({ bio: 'a'.repeat(281) })).toThrow();
  });
});
