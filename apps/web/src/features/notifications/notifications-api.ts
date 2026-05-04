import { z } from 'zod';
import { request } from '../../shared/api/http-client';

const notificationSchema = z.object({
  content_preview: z.string(),
  created_at: z.string(),
  is_read: z.boolean(),
  notification_id: z.string().uuid(),
  read_at: z.string().nullable(),
  source_id: z.string().uuid(),
  source_type: z.string(),
  type: z.string(),
});

const notificationPageSchema = z.object({
  items: z.array(notificationSchema),
  next_cursor: z.string().nullable(),
});

export type Notification = z.infer<typeof notificationSchema>;
export type NotificationPage = z.infer<typeof notificationPageSchema>;

export type ListNotificationsParams = {
  is_read?: boolean;
  limit?: number;
  cursor?: string;
};

export function fetchNotifications(
  params?: ListNotificationsParams,
): Promise<NotificationPage> {
  const searchParams = new URLSearchParams();
  if (params?.is_read !== undefined) searchParams.set('is_read', String(params.is_read));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.cursor) searchParams.set('cursor', params.cursor);

  const qs = searchParams.toString();
  const path = `/notifications${qs ? `?${qs}` : ''}`;

  return request<NotificationPage>('GET', path, { schema: notificationPageSchema });
}

export function markNotificationsRead(
  data: { notification_ids?: string[]; mark_all?: boolean },
): Promise<{ updated_count: number }> {
  return request<{ updated_count: number }>('POST', '/notifications/read', {
    body: data,
    schema: z.object({ updated_count: z.number() }),
  });
}
