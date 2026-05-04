import { describe, expect, it } from 'vitest';

import {
  joinVoiceChannelRequestSchema,
  updateVoiceStateRequestSchema,
  voiceSessionSummarySchema,
} from './voice';

describe('voice schemas', () => {
  it('accepts voice join defaults and initial controls', () => {
    expect(joinVoiceChannelRequestSchema.parse({})).toEqual({});
    expect(
      joinVoiceChannelRequestSchema.parse({
        initial_deafen_state: true,
        initial_mute_state: false,
      }),
    ).toEqual({
      initial_deafen_state: true,
      initial_mute_state: false,
    });
  });

  it('requires at least one voice state field', () => {
    expect(() => updateVoiceStateRequestSchema.parse({})).toThrow();
    expect(
      updateVoiceStateRequestSchema.parse({
        connection_status: 'connected',
        mute_state: true,
      }),
    ).toEqual({
      connection_status: 'connected',
      mute_state: true,
    });
  });

  it('validates voice session summaries', () => {
    expect(() =>
      voiceSessionSummarySchema.parse({
        channel_id: '00000000-0000-4000-8000-000000000001',
        connection_status: 'connected',
        deafen_state: false,
        joined_at: '2026-05-04T00:00:00.000Z',
        member: {
          avatar_attachment_id: null,
          nickname: 'Alice',
          user_id: '00000000-0000-4000-8000-000000000002',
          username: 'alice',
        },
        mute_state: false,
        session_id: '00000000-0000-4000-8000-000000000003',
        updated_at: '2026-05-04T00:00:01.000Z',
        user_id: '00000000-0000-4000-8000-000000000002',
      }),
    ).not.toThrow();
  });
});
