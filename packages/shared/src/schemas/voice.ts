import { z } from 'zod';

import { voiceMediaStateSchema } from './voice-media';

export const voiceConnectionStatusSchema = z.enum([
  'connecting',
  'connected',
  'reconnecting',
  'disconnected',
]);

export const joinVoiceChannelRequestSchema = z
  .object({
    initial_mute_state: z.boolean().optional(),
    initial_deafen_state: z.boolean().optional(),
  })
  .strict();

export const updateVoiceStateRequestSchema = z
  .object({
    mute_state: z.boolean().optional(),
    deafen_state: z.boolean().optional(),
    connection_status: voiceConnectionStatusSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.mute_state !== undefined ||
      value.deafen_state !== undefined ||
      value.connection_status !== undefined,
    { message: 'At least one voice state field must be provided.' },
  );

export const voiceSessionSummarySchema = z.object({
  channel_id: z.string().uuid(),
  connection_status: voiceConnectionStatusSchema,
  deafen_state: z.boolean(),
  joined_at: z.string().datetime({ offset: true }),
  media_state: voiceMediaStateSchema,
  member: z.object({
    avatar_attachment_id: z.string().uuid().nullable(),
    nickname: z.string().min(1),
    user_id: z.string().uuid(),
    username: z.string().min(1),
  }),
  mute_state: z.boolean(),
  producer_id: z.string().min(1).nullable(),
  session_id: z.string().uuid(),
  updated_at: z.string().datetime({ offset: true }),
  user_id: z.string().uuid(),
});

export type JoinVoiceChannelRequest = z.infer<typeof joinVoiceChannelRequestSchema>;

export type UpdateVoiceStateRequest = z.infer<typeof updateVoiceStateRequestSchema>;

export type VoiceConnectionStatusValue = z.infer<typeof voiceConnectionStatusSchema>;

export type VoiceSessionSummary = z.infer<typeof voiceSessionSummarySchema>;
