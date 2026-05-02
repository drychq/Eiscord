import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { RealtimeEvent } from '../constants/realtime-events';
import {
  realtimeEventEnvelopeSchema,
  realtimeHeartbeatPayloadSchema,
  realtimeSubscribePayloadSchema,
} from './realtime';

describe('realtime schemas', () => {
  it('validates realtime event envelopes', () => {
    const schema = realtimeEventEnvelopeSchema(z.object({ message_id: z.string().uuid() }));

    expect(() =>
      schema.parse({
        event_id: '00000000-0000-4000-8000-000000000001',
        event_name: RealtimeEvent.MessageCreated,
        occurred_at: '2026-05-01T12:00:00.000Z',
        payload: {
          message_id: '00000000-0000-4000-8000-000000000002',
        },
        request_id: 'request-1',
      }),
    ).not.toThrow();
  });

  it('validates subscribe and heartbeat payloads', () => {
    expect(
      realtimeSubscribePayloadSchema.parse({
        scope_id: '00000000-0000-4000-8000-000000000001',
        scope_type: 'channel',
      }),
    ).toEqual({
      scope_id: '00000000-0000-4000-8000-000000000001',
      scope_type: 'channel',
    });

    expect(realtimeHeartbeatPayloadSchema.parse({})).toEqual({});
  });
});
