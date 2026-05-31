// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { buildInviteLink } from './invite-link';

describe('buildInviteLink', () => {
  it('builds an absolute invite URL on the current origin', () => {
    expect(buildInviteLink('abc123')).toBe(`${window.location.origin}/invite/abc123`);
  });

  it('preserves the raw code, including base64url characters, in the path', () => {
    expect(buildInviteLink('Xy-_09')).toBe(`${window.location.origin}/invite/Xy-_09`);
  });
});
