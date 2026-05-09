import {
  iceServerSchema,
  joinVoiceChannelRequestSchema,
  joinVoiceMediaResponseSchema,
  updateVoiceStateRequestSchema,
  voiceSessionSummarySchema,
  type IceServer,
  type JoinVoiceChannelRequest,
  type JoinVoiceMediaResponse,
  type UpdateVoiceStateRequest,
  type VoiceSessionSummary,
} from '@eiscord/shared';
import { z } from 'zod';

import { request } from '../../shared/api/http-client';

export type VoiceSession = VoiceSessionSummary;

export type JoinVoiceInput = JoinVoiceChannelRequest;

export type UpdateVoiceStateInput = UpdateVoiceStateRequest;

export type JoinVoiceChannelResponse = VoiceSession & {
  media: JoinVoiceMediaResponse;
};

const joinVoiceChannelResponseSchema = voiceSessionSummarySchema.and(
  z.object({ media: joinVoiceMediaResponseSchema }),
);

const refreshIceServersResponseSchema = z.object({ ice_servers: z.array(iceServerSchema) });

export function listVoiceSessions(channelId: string): Promise<VoiceSession[]> {
  return request<VoiceSession[]>('GET', `/voice/channels/${channelId}/sessions`, {
    schema: z.array(voiceSessionSummarySchema),
  });
}

export function joinVoiceChannel(
  channelId: string,
  input: JoinVoiceInput = {},
): Promise<JoinVoiceChannelResponse> {
  const body = joinVoiceChannelRequestSchema.parse(input);

  return request<JoinVoiceChannelResponse>('POST', `/voice/channels/${channelId}/join`, {
    body,
    schema: joinVoiceChannelResponseSchema,
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

export function refreshVoiceIceServers(sessionId: string): Promise<{ ice_servers: IceServer[] }> {
  return request<{ ice_servers: IceServer[] }>('GET', `/voice/sessions/${sessionId}/ice-servers`, {
    schema: refreshIceServersResponseSchema,
  });
}

