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
