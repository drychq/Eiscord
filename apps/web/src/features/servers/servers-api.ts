import { z } from 'zod';
import { request } from '../../shared/api/http-client';

const serverSummarySchema = z.object({
  description: z.string().nullable(),
  icon_attachment_id: z.string().uuid().nullable(),
  joined_at: z.string(),
  member_status: z.string(),
  name: z.string(),
  owner_id: z.string().uuid(),
  server_id: z.string().uuid(),
  status: z.string(),
});

const channelSummarySchema = z.object({
  channel_id: z.string().uuid(),
  created_at: z.string(),
  name: z.string(),
  server_id: z.string().uuid(),
  sort_order: z.number(),
  status: z.string(),
  topic: z.string().nullable(),
  type: z.string(),
});

const roleSummarySchema = z.object({
  color: z.string().nullable(),
  is_default: z.boolean(),
  name: z.string(),
  permission_bits: z.string(),
  priority: z.number(),
  role_id: z.string().uuid(),
  server_id: z.string().uuid(),
});

const serverMemberUserSummarySchema = z.object({
  avatar_attachment_id: z.string().uuid().nullable(),
  nickname: z.string(),
  presence_status: z.string(),
  user_id: z.string().uuid(),
  username: z.string(),
});

const memberSummarySchema = z.object({
  joined_at: z.string(),
  member_status: z.string(),
  membership_id: z.string().uuid(),
  nick_in_server: z.string().nullable(),
  role_ids: z.array(z.string().uuid()),
  server_id: z.string().uuid(),
  user: serverMemberUserSummarySchema,
});

const serverBaseSummarySchema = z.object({
  created_at: z.string(),
  description: z.string().nullable(),
  icon_attachment_id: z.string().uuid().nullable(),
  name: z.string(),
  owner_id: z.string().uuid(),
  server_id: z.string().uuid(),
  status: z.string(),
});

const serverDetailSchema = serverBaseSummarySchema.extend({
  channels: z.array(channelSummarySchema),
  current_member: memberSummarySchema,
  members: z.array(memberSummarySchema),
  roles: z.array(roleSummarySchema),
});

const serverCreateResponseSchema = z.object({
  default_channel: channelSummarySchema,
  default_role: roleSummarySchema,
  invite_code: z.string(),
  owner_member: memberSummarySchema,
  server: serverBaseSummarySchema,
});

export type ServerSummary = z.infer<typeof serverSummarySchema>;
export type ServerDetail = z.infer<typeof serverDetailSchema>;
export type ChannelSummary = z.infer<typeof channelSummarySchema>;
export type MemberSummary = z.infer<typeof memberSummarySchema>;
export type RoleSummary = z.infer<typeof roleSummarySchema>;

export function fetchServers(): Promise<ServerSummary[]> {
  return request<ServerSummary[]>('GET', '/servers', {
    schema: z.array(serverSummarySchema),
  });
}

export function fetchServerDetail(serverId: string): Promise<ServerDetail> {
  return request<ServerDetail>('GET', `/servers/${serverId}`, {
    schema: serverDetailSchema,
  });
}

export function createServer(name: string, description?: string): Promise<z.infer<typeof serverCreateResponseSchema>> {
  return request('POST', '/servers', {
    body: { name, description: description ?? null },
    schema: serverCreateResponseSchema,
  });
}

export function joinServer(inviteCode: string): Promise<ServerDetail> {
  return request<ServerDetail>('POST', '/servers/join', {
    body: { invite_code: inviteCode },
    schema: serverDetailSchema,
  });
}

export function leaveServer(serverId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>('POST', `/servers/${serverId}/leave`, {
    schema: z.object({ ok: z.literal(true) }),
  });
}

export function fetchServerMembers(serverId: string): Promise<MemberSummary[]> {
  return request<MemberSummary[]>('GET', `/servers/${serverId}/members`, {
    schema: z.array(memberSummarySchema),
  });
}
