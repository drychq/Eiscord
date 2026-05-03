export type NotificationRow = {
  contentPreview: string;
  createdAt: Date;
  dedupeKey: string;
  id: string;
  isRead: boolean;
  readAt: Date | null;
  sourceId: string;
  sourceType: string;
  type: string;
  userId: string;
};

export type NotificationSummary = {
  content_preview: string;
  created_at: string;
  is_read: boolean;
  notification_id: string;
  read_at: string | null;
  source_id: string;
  source_type: string;
  type: string;
};

export type NotificationListResponse = {
  items: NotificationSummary[];
  next_cursor: string | null;
};

export function toNotificationSummary(row: NotificationRow): NotificationSummary {
  return {
    content_preview: row.contentPreview,
    created_at: row.createdAt.toISOString(),
    is_read: row.isRead,
    notification_id: row.id,
    read_at: row.readAt?.toISOString() ?? null,
    source_id: row.sourceId,
    source_type: row.sourceType,
    type: row.type,
  };
}
