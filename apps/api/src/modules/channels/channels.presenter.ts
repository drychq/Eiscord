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

export type PermissionOverwriteRow = {
  allowBits: bigint | number | string;
  channelId: string;
  denyBits: bigint | number | string;
  id: string;
  targetId: string;
  targetType: string;
};

export type ChannelSummary = {
  channel_id: string;
  created_at: string;
  name: string;
  permission_overwrites: PermissionOverwriteSummary[];
  server_id: string;
  sort_order: number;
  status: string;
  topic: string | null;
  type: string;
};

export type PermissionOverwriteSummary = {
  allow_bits: string;
  deny_bits: string;
  overwrite_id: string;
  target_id: string;
  target_type: string;
};

export function toChannelSummary(
  row: ChannelRow,
  permissionOverwrites: PermissionOverwriteRow[] = [],
): ChannelSummary {
  return {
    channel_id: row.id,
    created_at: row.createdAt.toISOString(),
    name: row.name,
    permission_overwrites: permissionOverwrites.map(toPermissionOverwriteSummary),
    server_id: row.serverId,
    sort_order: row.sortOrder,
    status: row.status,
    topic: row.topic,
    type: row.type,
  };
}

export function toPermissionOverwriteSummary(
  row: PermissionOverwriteRow,
): PermissionOverwriteSummary {
  return {
    allow_bits: String(row.allowBits),
    deny_bits: String(row.denyBits),
    overwrite_id: row.id,
    target_id: row.targetId,
    target_type: row.targetType,
  };
}
