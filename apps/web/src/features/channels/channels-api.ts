import { z } from 'zod';
import { request } from '../../shared/api/http-client';

const channelSummarySchema = z.object({
  channel_id: z.string().uuid(),
  created_at: z.string(),
  name: z.string(),
  permission_overwrites: z.array(z.object({
    allow_bits: z.string(),
    deny_bits: z.string(),
    overwrite_id: z.string().uuid(),
    target_id: z.string().uuid(),
    target_type: z.string(),
  })).default([]),
  server_id: z.string().uuid(),
  sort_order: z.number(),
  status: z.string(),
  topic: z.string().nullable(),
  type: z.string(),
});

export type ChannelSummary = z.infer<typeof channelSummarySchema>;

const serverChannelsWrapperSchema = z.object({
  channels: z.array(channelSummarySchema),
});

export function fetchServerChannels(serverId: string): Promise<ChannelSummary[]> {
  return request<{ channels: ChannelSummary[] }>('GET', `/servers/${serverId}`, {
    schema: serverChannelsWrapperSchema,
  }).then((data) => data.channels);
}
