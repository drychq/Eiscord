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
  permission_overwrites: z
    .array(
      z.object({
        allow_bits: z.string(),
        deny_bits: z.string(),
        overwrite_id: z.string().uuid(),
        target_id: z.string().uuid(),
        target_type: z.enum(['role', 'member']),
      }),
    )
    .default([]),
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

const inviteCreatorSchema = z.object({
  avatar_attachment_id: z.string().uuid().nullable(),
  nickname: z.string(),
  user_id: z.string().uuid(),
  username: z.string(),
});

const inviteSummarySchema = z.object({
  code: z.string(),
  created_at: z.string(),
  creator: inviteCreatorSchema,
  expires_at: z.string().nullable(),
  invite_id: z.string().uuid(),
  max_uses: z.number().nullable(),
  server_id: z.string().uuid(),
  status: z.string(),
  used_count: z.number(),
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
export type InviteSummary = z.infer<typeof inviteSummarySchema>;

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

export function fetchServerRoles(serverId: string): Promise<RoleSummary[]> {
  return request<RoleSummary[]>('GET', `/servers/${serverId}/roles`, {
    schema: z.array(roleSummarySchema),
  });
}

export type ManageMemberAction = 'mute' | 'restore' | 'remove';

export function manageMember(
  serverId: string,
  memberId: string,
  action: ManageMemberAction,
  reason?: string,
): Promise<MemberSummary> {
  return request<MemberSummary>('PATCH', `/servers/${serverId}/members/${memberId}`, {
    body: { action, reason: reason ?? null },
    schema: memberSummarySchema,
  });
}

const createRoleResponseSchema = roleSummarySchema;

export function createRole(
  serverId: string,
  data: { name: string; permission_bits: string; color?: string; priority?: number },
): Promise<RoleSummary> {
  return request<RoleSummary>('POST', `/servers/${serverId}/roles`, {
    body: {
      name: data.name,
      permission_bits: data.permission_bits,
      color: data.color ?? null,
      priority: data.priority ?? 0,
    },
    schema: createRoleResponseSchema,
  });
}

export function updateRole(
  serverId: string,
  roleId: string,
  data: { name?: string; permission_bits?: string; color?: string; priority?: number },
): Promise<RoleSummary> {
  return request<RoleSummary>('PATCH', `/servers/${serverId}/roles/${roleId}`, {
    body: data,
    schema: roleSummarySchema,
  });
}

export function deleteRole(
  serverId: string,
  roleId: string,
): Promise<{ ok: true }> {
  return request<{ ok: true }>('DELETE', `/servers/${serverId}/roles/${roleId}`, {
    schema: z.object({ ok: z.literal(true) }),
  });
}

export function assignRole(
  serverId: string,
  memberId: string,
  roleId: string,
): Promise<MemberSummary> {
  return request<MemberSummary>('POST', `/servers/${serverId}/members/${memberId}/roles`, {
    body: { role_id: roleId },
    schema: memberSummarySchema,
  });
}

export function removeRole(
  serverId: string,
  memberId: string,
  roleId: string,
): Promise<MemberSummary> {
  return request<MemberSummary>(
    'DELETE',
    `/servers/${serverId}/members/${memberId}/roles/${roleId}`,
    { schema: memberSummarySchema },
  );
}

export const permissionOverwriteSchema = z.object({
  target_type: z.enum(['role', 'member']),
  target_id: z.string().uuid(),
  allow_bits: z.string(),
  deny_bits: z.string(),
});

export type PermissionOverwriteInput = z.infer<typeof permissionOverwriteSchema>;

export function createChannel(
  serverId: string,
  data: {
    name: string;
    type: 'text' | 'voice';
    topic?: string;
    sort_order?: number;
    permission_overwrites?: PermissionOverwriteInput[];
  },
): Promise<ChannelSummary> {
  return request<ChannelSummary>('POST', `/servers/${serverId}/channels`, {
    body: {
      name: data.name,
      type: data.type,
      topic: data.topic ?? null,
      sort_order: data.sort_order,
      permission_overwrites: data.permission_overwrites ?? [],
    },
    schema: channelSummarySchema,
  });
}

export function updateChannel(
  channelId: string,
  data: {
    name?: string;
    type?: 'text' | 'voice';
    topic?: string;
    sort_order?: number;
    permission_overwrites?: PermissionOverwriteInput[];
  },
): Promise<ChannelSummary> {
  return request<ChannelSummary>('PATCH', `/channels/${channelId}`, {
    body: data,
    schema: channelSummarySchema,
  });
}

export function deleteChannel(channelId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>('DELETE', `/channels/${channelId}`, {
    schema: z.object({ ok: z.literal(true) }),
  });
}

export function fetchServerInvites(serverId: string): Promise<InviteSummary[]> {
  return request<InviteSummary[]>('GET', `/servers/${serverId}/invites`, {
    schema: z.array(inviteSummarySchema),
  });
}

export function createInvite(serverId: string): Promise<InviteSummary> {
  return request<InviteSummary>('POST', `/servers/${serverId}/invites`, {
    schema: inviteSummarySchema,
  });
}

export function revokeInvite(serverId: string, inviteId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>('DELETE', `/servers/${serverId}/invites/${inviteId}`, {
    schema: z.object({ ok: z.literal(true) }),
  });
}
