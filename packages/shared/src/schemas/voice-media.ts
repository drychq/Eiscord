import { z } from 'zod';

export const voiceMediaStateSchema = z.enum([
  'IDLE',
  'NEGOTIATING',
  'CONNECTED',
  'RECONNECTING',
  'FAILED',
]);

export type VoiceMediaStateValue = z.infer<typeof voiceMediaStateSchema>;

export const voiceTransportDirectionSchema = z.enum(['send', 'recv']);

export const voiceProducerKindSchema = z.literal('audio');

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

export const voiceTransportCreatedRequestSchema = z
  .object({
    session_id: z.string().uuid(),
    direction: voiceTransportDirectionSchema,
  })
  .strict();

export const voiceTransportConnectRequestSchema = z
  .object({
    session_id: z.string().uuid(),
    transport_id: z.string().min(1),
    dtls_parameters: z.record(z.string(), z.unknown()),
  })
  .strict();

export const voiceProducerCreatedRequestSchema = z
  .object({
    session_id: z.string().uuid(),
    transport_id: z.string().min(1),
    kind: voiceProducerKindSchema,
    rtp_parameters: z.record(z.string(), z.unknown()),
  })
  .strict();

export const voiceConsumerCreatedRequestSchema = z
  .object({
    session_id: z.string().uuid(),
    producer_id: z.string().min(1),
    rtp_capabilities: z.record(z.string(), z.unknown()),
  })
  .strict();

export const voiceConsumerResumedRequestSchema = z
  .object({
    session_id: z.string().uuid(),
    consumer_id: z.string().min(1),
  })
  .strict();

export type IceServer = z.infer<typeof iceServerSchema>;
export type VoiceActiveProducer = z.infer<typeof voiceActiveProducerSchema>;
export type JoinVoiceMediaResponse = z.infer<typeof joinVoiceMediaResponseSchema>;
export type VoiceTransportDirection = z.infer<typeof voiceTransportDirectionSchema>;
export type VoiceRouterCapabilitiesRequest = z.infer<typeof voiceRouterCapabilitiesRequestSchema>;
export type VoiceTransportCreatedRequest = z.infer<typeof voiceTransportCreatedRequestSchema>;
export type VoiceTransportConnectRequest = z.infer<typeof voiceTransportConnectRequestSchema>;
export type VoiceProducerCreatedRequest = z.infer<typeof voiceProducerCreatedRequestSchema>;
export type VoiceConsumerCreatedRequest = z.infer<typeof voiceConsumerCreatedRequestSchema>;
export type VoiceConsumerResumedRequest = z.infer<typeof voiceConsumerResumedRequestSchema>;
