import {
  joinVoiceChannelRequestSchema,
  updateVoiceStateRequestSchema,
  voiceSessionSummarySchema,
  type JoinVoiceChannelRequest,
  type UpdateVoiceStateRequest,
  type VoiceSessionSummary,
} from '@eiscord/shared';
import { z } from 'zod';

import { request } from '../../shared/api/http-client';

export type VoiceSession = VoiceSessionSummary;

export type JoinVoiceInput = JoinVoiceChannelRequest;

export type UpdateVoiceStateInput = UpdateVoiceStateRequest;

export function listVoiceSessions(channelId: string): Promise<VoiceSession[]> {
  return request<VoiceSession[]>('GET', `/voice/channels/${channelId}/sessions`, {
    schema: z.array(voiceSessionSummarySchema),
  });
}

export function joinVoiceChannel(
  channelId: string,
  input: JoinVoiceInput = {},
): Promise<VoiceSession> {
  const body = joinVoiceChannelRequestSchema.parse(input);

  return request<VoiceSession>('POST', `/voice/channels/${channelId}/join`, {
    body,
    schema: voiceSessionSummarySchema,
  });
}

export function leaveVoiceSession(sessionId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>('POST', `/voice/sessions/${sessionId}/leave`, {
    schema: z.object({ ok: z.literal(true) }),
  });
}

export function updateVoiceState(
  sessionId: string,
  input: UpdateVoiceStateInput,
): Promise<VoiceSession> {
  const body = updateVoiceStateRequestSchema.parse(input);

  return request<VoiceSession>('PATCH', `/voice/sessions/${sessionId}/state`, {
    body,
    schema: voiceSessionSummarySchema,
  });
}
