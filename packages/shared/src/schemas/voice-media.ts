import { z } from 'zod';

export const voiceMediaStateSchema = z.enum([
  'idle',
  'negotiating',
  'connected',
  'reconnecting',
  'failed',
]);

export type VoiceMediaStateValue = z.infer<typeof voiceMediaStateSchema>;

export const voiceTransportDirectionSchema = z.enum(['send', 'recv']);

export const voiceProducerKindSchema = z.literal('audio');

export const voiceProducerCloseReasonSchema = z.enum([
  'manual_leave',
  'signaling_timeout',
  'worker_died',
  'permission_lost',
]);

export const iceServerSchema = z.object({
  urls: z.array(z.string().min(1)).min(1),
  username: z.string().min(1),
  credential: z.string().min(1),
  credential_type: z.literal('password'),
  ttl_seconds: z.number().int().positive(),
});

export const voiceActiveProducerSchema = z.object({
  channel_id: z.string().uuid(),
  user_id: z.string().uuid(),
  producer_id: z.string().min(1),
  kind: voiceProducerKindSchema,
  paused: z.boolean(),
});

export const joinVoiceMediaResponseSchema = z.object({
  router_rtp_capabilities: z.record(z.string(), z.unknown()),
  ice_servers: z.array(iceServerSchema),
  signaling_channel: z.string().min(1),
  active_producers: z.array(voiceActiveProducerSchema),
});

export const voiceRouterCapabilitiesRequestSchema = z
  .object({
    channel_id: z.string().uuid(),
    session_id: z.string().uuid(),
  })
  .strict();

export const voiceRouterCapabilitiesResponseSchema = z.object({
  router_id: z.string().min(1),
  rtp_capabilities: z.record(z.string(), z.unknown()),
});

export const voiceTransportCreatedRequestSchema = z
  .object({
    session_id: z.string().uuid(),
    direction: voiceTransportDirectionSchema,
  })
  .strict();

export const voiceTransportCreatedResponseSchema = z.object({
  transport_id: z.string().min(1),
  ice_parameters: z.record(z.string(), z.unknown()),
  ice_candidates: z.array(z.record(z.string(), z.unknown())),
  dtls_parameters: z.record(z.string(), z.unknown()),
  ice_servers: z.array(iceServerSchema),
});

export const voiceTransportConnectRequestSchema = z
  .object({
    session_id: z.string().uuid(),
    transport_id: z.string().min(1),
    dtls_parameters: z.record(z.string(), z.unknown()),
  })
  .strict();

export const voiceTransportConnectResponseSchema = z.object({
  ok: z.literal(true),
});

export const voiceProducerCreatedRequestSchema = z
  .object({
    session_id: z.string().uuid(),
    transport_id: z.string().min(1),
    kind: voiceProducerKindSchema,
    rtp_parameters: z.record(z.string(), z.unknown()),
  })
  .strict();

export const voiceProducerCreatedResponseSchema = z.object({
  producer_id: z.string().min(1),
});

export const voiceProducerCreatedBroadcastSchema = z.object({
  channel_id: z.string().uuid(),
  user_id: z.string().uuid(),
  producer_id: z.string().min(1),
  kind: voiceProducerKindSchema,
  paused: z.boolean(),
  created_at: z.string().datetime({ offset: true }),
});

export const voiceConsumerCreatedRequestSchema = z
  .object({
    session_id: z.string().uuid(),
    producer_id: z.string().min(1),
    rtp_capabilities: z.record(z.string(), z.unknown()),
  })
  .strict();

export const voiceConsumerCreatedResponseSchema = z.object({
  consumer_id: z.string().min(1),
  kind: voiceProducerKindSchema,
  rtp_parameters: z.record(z.string(), z.unknown()),
  producer_paused: z.boolean(),
});

export const voiceConsumerResumedRequestSchema = z
  .object({
    session_id: z.string().uuid(),
    consumer_id: z.string().min(1),
  })
  .strict();

export const voiceConsumerResumedResponseSchema = z.object({
  ok: z.literal(true),
});

export const voiceProducerClosedPayloadSchema = z.object({
  channel_id: z.string().uuid(),
  user_id: z.string().uuid(),
  producer_id: z.string().min(1),
  reason: voiceProducerCloseReasonSchema,
  closed_at: z.string().datetime({ offset: true }),
});

export const voiceActiveSpeakerPayloadSchema = z.object({
  channel_id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  audio_level: z.number(),
  observed_at: z.string().datetime({ offset: true }),
});

export type IceServer = z.infer<typeof iceServerSchema>;
export type VoiceActiveProducer = z.infer<typeof voiceActiveProducerSchema>;
export type JoinVoiceMediaResponse = z.infer<typeof joinVoiceMediaResponseSchema>;
export type VoiceTransportDirection = z.infer<typeof voiceTransportDirectionSchema>;
export type VoiceProducerCloseReason = z.infer<typeof voiceProducerCloseReasonSchema>;
export type VoiceRouterCapabilitiesRequest = z.infer<typeof voiceRouterCapabilitiesRequestSchema>;
export type VoiceRouterCapabilitiesResponse = z.infer<typeof voiceRouterCapabilitiesResponseSchema>;
export type VoiceTransportCreatedRequest = z.infer<typeof voiceTransportCreatedRequestSchema>;
export type VoiceTransportCreatedResponse = z.infer<typeof voiceTransportCreatedResponseSchema>;
export type VoiceTransportConnectRequest = z.infer<typeof voiceTransportConnectRequestSchema>;
export type VoiceProducerCreatedRequest = z.infer<typeof voiceProducerCreatedRequestSchema>;
export type VoiceProducerCreatedResponse = z.infer<typeof voiceProducerCreatedResponseSchema>;
export type VoiceProducerCreatedBroadcast = z.infer<typeof voiceProducerCreatedBroadcastSchema>;
export type VoiceConsumerCreatedRequest = z.infer<typeof voiceConsumerCreatedRequestSchema>;
export type VoiceConsumerCreatedResponse = z.infer<typeof voiceConsumerCreatedResponseSchema>;
export type VoiceConsumerResumedRequest = z.infer<typeof voiceConsumerResumedRequestSchema>;
export type VoiceConsumerResumedResponse = z.infer<typeof voiceConsumerResumedResponseSchema>;
export type VoiceProducerClosedPayload = z.infer<typeof voiceProducerClosedPayloadSchema>;
export type VoiceActiveSpeakerPayload = z.infer<typeof voiceActiveSpeakerPayloadSchema>;
