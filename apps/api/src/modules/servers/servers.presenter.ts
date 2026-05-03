export type ServerSummary = {
  description: string | null;
  icon_attachment_id: string | null;
  joined_at: string;
  member_status: string;
  name: string;
  owner_id: string;
  server_id: string;
  status: string;
};

export type ServerCreateResponse = {
  default_channel: ChannelSummary;
  default_role: RoleSummary;
  invite_code: string;
  owner_member: MemberSummary;
  server: ServerBaseSummary;
};

export type ServerDetail = ServerBaseSummary & {
  channels: ChannelSummary[];
  current_member: MemberSummary;
  members: MemberSummary[];
  roles: RoleSummary[];
};

export type ServerBaseSummary = {
  created_at: string;
  description: string | null;
  icon_attachment_id: string | null;
  name: string;
  owner_id: string;
  server_id: string;
  status: string;
};

export type ChannelSummary = {
  channel_id: string;
  created_at: string;
  name: string;
  server_id: string;
  sort_order: number;
  status: string;
  topic: string | null;
  type: string;
};

export type RoleSummary = {
  color: string | null;
  is_default: boolean;
  name: string;
  permission_bits: string;
  priority: number;
  role_id: string;
  server_id: string;
};

export type MemberSummary = {
  joined_at: string;
  member_status: string;
  membership_id: string;
  nick_in_server: string | null;
  role_ids: string[];
  server_id: string;
  user: ServerMemberUserSummary;
};

export type ServerMemberUserSummary = {
  avatar_attachment_id: string | null;
  nickname: string;
  presence_status: string;
  user_id: string;
  username: string;
};

export type ServerRow = {
  createdAt: Date;
  description: string | null;
  iconAttachmentId: string | null;
  id: string;
  name: string;
  ownerId: string;
  status: string;
};

export type ServerListRow = ServerRow & {
  joinedAt: Date;
  memberStatus: string;
};

export type ChannelRow = {
  createdAt: Date;
  id: string;
  name: string;
  serverId: string;
  sortOrder: number;
  status: string;
  topic: string | null;
  type: string;
};

export type RoleRow = {
  color: string | null;
  id: string;
  isDefault: boolean;
  name: string;
  permissionBits: bigint | number | string;
  priority: number;
  serverId: string;
};

export type MemberRow = {
  avatarAttachmentId: string | null;
  joinedAt: Date;
  memberStatus: string;
  membershipId: string;
  nickInServer: string | null;
  presenceStatus: string;
  roleIds: string[] | null;
  serverId: string;
  userId: string;
  username: string;
  userNickname: string;
};

export function toServerBaseSummary(row: ServerRow): ServerBaseSummary {
  return {
    created_at: row.createdAt.toISOString(),
    description: row.description,
    icon_attachment_id: row.iconAttachmentId,
    name: row.name,
    owner_id: row.ownerId,
    server_id: row.id,
    status: row.status,
  };
}

export function toServerSummary(row: ServerListRow): ServerSummary {
  return {
    description: row.description,
    icon_attachment_id: row.iconAttachmentId,
    joined_at: row.joinedAt.toISOString(),
    member_status: row.memberStatus,
    name: row.name,
    owner_id: row.ownerId,
    server_id: row.id,
    status: row.status,
  };
}

export function toChannelSummary(row: ChannelRow): ChannelSummary {
  return {
    channel_id: row.id,
    created_at: row.createdAt.toISOString(),
    name: row.name,
    server_id: row.serverId,
    sort_order: row.sortOrder,
    status: row.status,
    topic: row.topic,
    type: row.type,
  };
}

export function toRoleSummary(row: RoleRow): RoleSummary {
  return {
    color: row.color,
    is_default: row.isDefault,
    name: row.name,
    permission_bits: String(row.permissionBits),
    priority: row.priority,
    role_id: row.id,
    server_id: row.serverId,
  };
}

export function toMemberSummary(row: MemberRow): MemberSummary {
  return {
    joined_at: row.joinedAt.toISOString(),
    member_status: row.memberStatus,
    membership_id: row.membershipId,
    nick_in_server: row.nickInServer,
    role_ids: row.roleIds ?? [],
    server_id: row.serverId,
    user: {
      avatar_attachment_id: row.avatarAttachmentId,
      nickname: row.userNickname,
      presence_status: row.presenceStatus,
      user_id: row.userId,
      username: row.username,
    },
  };
}
