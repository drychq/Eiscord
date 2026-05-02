import { z } from 'zod';

import { RealtimeEvent } from '../constants/realtime-events';

const realtimeEventValues = Object.values(RealtimeEvent) as [RealtimeEvent, ...RealtimeEvent[]];

export const realtimeScopeTypeSchema = z.enum(['user', 'dm', 'server', 'channel', 'voice']);

export const realtimeSubscribePayloadSchema = z.object({
  scope_type: realtimeScopeTypeSchema,
  scope_id: z.string().uuid(),
});

export const realtimeUnsubscribePayloadSchema = realtimeSubscribePayloadSchema;

export const realtimeHeartbeatPayloadSchema = z
  .object({
    client_time: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export function realtimeEventEnvelopeSchema<TSchema extends z.ZodType<unknown>>(
  payloadSchema: TSchema,
) {
  return z.object({
    event_id: z.string().uuid(),
    event_name: z.enum(realtimeEventValues),
    occurred_at: z.string().datetime({ offset: true }),
    payload: payloadSchema,
    request_id: z.string().min(1).optional(),
  });
}

export type RealtimeScopeType = z.infer<typeof realtimeScopeTypeSchema>;

export type RealtimeSubscribePayload = z.infer<typeof realtimeSubscribePayloadSchema>;

export type RealtimeUnsubscribePayload = z.infer<typeof realtimeUnsubscribePayloadSchema>;

export type RealtimeHeartbeatPayload = z.infer<typeof realtimeHeartbeatPayloadSchema>;

export type RealtimeEventEnvelope<TPayload> = {
  event_id: string;
  event_name: RealtimeEvent;
  occurred_at: string;
  payload: TPayload;
  request_id?: string;
};
