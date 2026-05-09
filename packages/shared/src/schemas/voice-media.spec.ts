import { describe, expect, it } from 'vitest';

import {
  iceServerSchema,
  joinVoiceMediaResponseSchema,
  voiceActiveSpeakerPayloadSchema,
  voiceConsumerCreatedRequestSchema,
  voiceConsumerResumedRequestSchema,
  voiceProducerClosedPayloadSchema,
  voiceProducerCreatedRequestSchema,
  voiceRouterCapabilitiesRequestSchema,
  voiceTransportConnectRequestSchema,
  voiceTransportCreatedRequestSchema,
} from './voice-media';

describe('voice media schemas', () => {
  it('validates TURN ICE server credentials', () => {
    expect(
      iceServerSchema.parse({
        credential: 'credential',
        credential_type: 'password',
        ttl_seconds: 300,
        urls: ['turn:localhost:3478?transport=udp'],
        username: '1714915200:user-id',
      }),
    ).toEqual({
      credential: 'credential',
      credential_type: 'password',
      ttl_seconds: 300,
      urls: ['turn:localhost:3478?transport=udp'],
      username: '1714915200:user-id',
    });
  });

  it('validates join media payload', () => {
    expect(() =>
      joinVoiceMediaResponseSchema.parse({
        ice_servers: [
          {
            credential: 'credential',
            credential_type: 'password',
            ttl_seconds: 300,
            urls: ['turn:localhost:3478?transport=udp'],
            username: '1714915200:user-id',
          },
        ],
        active_producers: [
          {
            channel_id: '00000000-0000-4000-8000-000000000001',
            kind: 'audio',
            paused: false,
            producer_id: 'producer-1',
            user_id: '00000000-0000-4000-8000-000000000002',
          },
        ],
        router_rtp_capabilities: { codecs: [] },
        signaling_channel: 'voice:00000000-0000-4000-8000-000000000001',
      }),
    ).not.toThrow();
  });

  it('validates signaling requests', () => {
    const sessionId = '00000000-0000-4000-8000-000000000001';
    const channelId = '00000000-0000-4000-8000-000000000002';

    expect(voiceRouterCapabilitiesRequestSchema.parse({ channel_id: channelId, session_id: sessionId })).toEqual({
      channel_id: channelId,
      session_id: sessionId,
    });
    expect(voiceTransportCreatedRequestSchema.parse({ direction: 'send', session_id: sessionId })).toEqual({
      direction: 'send',
      session_id: sessionId,
    });
    expect(
      voiceTransportConnectRequestSchema.parse({
        dtls_parameters: { fingerprints: [] },
        session_id: sessionId,
        transport_id: 'transport-1',
      }),
    ).toEqual({
      dtls_parameters: { fingerprints: [] },
      session_id: sessionId,
      transport_id: 'transport-1',
    });
    expect(
      voiceProducerCreatedRequestSchema.parse({
        kind: 'audio',
        rtp_parameters: { codecs: [] },
        session_id: sessionId,
        transport_id: 'transport-1',
      }),
    ).toEqual({
      kind: 'audio',
      rtp_parameters: { codecs: [] },
      session_id: sessionId,
      transport_id: 'transport-1',
    });
    expect(
      voiceConsumerCreatedRequestSchema.parse({
        producer_id: 'producer-1',
        rtp_capabilities: { codecs: [] },
        session_id: sessionId,
      }),
    ).toEqual({
      producer_id: 'producer-1',
      rtp_capabilities: { codecs: [] },
      session_id: sessionId,
    });
    expect(
      voiceConsumerResumedRequestSchema.parse({
        consumer_id: 'consumer-1',
        session_id: sessionId,
      }),
    ).toEqual({
      consumer_id: 'consumer-1',
      session_id: sessionId,
    });
  });

  it('validates server broadcasts', () => {
    expect(() =>
      voiceProducerClosedPayloadSchema.parse({
        channel_id: '00000000-0000-4000-8000-000000000001',
        closed_at: '2026-05-04T00:00:00.000Z',
        producer_id: 'producer-1',
        reason: 'manual_leave',
        user_id: '00000000-0000-4000-8000-000000000002',
      }),
    ).not.toThrow();
    expect(() =>
      voiceActiveSpeakerPayloadSchema.parse({
        audio_level: -32.5,
        channel_id: '00000000-0000-4000-8000-000000000001',
        observed_at: '2026-05-04T00:00:00.000Z',
        user_id: null,
      }),
    ).not.toThrow();
  });
});
