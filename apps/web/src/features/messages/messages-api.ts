import { z } from 'zod';
import { request } from '../../shared/api/http-client';

const messageSchema = z.object({
  message_id: z.string().uuid(),
  channel_id: z.string().uuid().nullable(),
  conversation_id: z.string().uuid().nullable(),
  sender_id: z.string().uuid(),
  content: z.string().nullable(),
  attachment_ids: z.array(z.string().uuid()),
  mention_user_ids: z.array(z.string().uuid()),
  client_message_id: z.string().nullable(),
  visibility: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const messagePageSchema = z.object({
  items: z.array(messageSchema),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
});

export type Message = z.infer<typeof messageSchema>;
export type MessagePage = z.infer<typeof messagePageSchema>;

const sendMessageRequestSchema = z.object({
  content: z.string().max(4000).optional(),
  attachment_ids: z.array(z.string().uuid()).max(10).optional(),
  mention_user_ids: z.array(z.string().uuid()).max(50).optional(),
  client_message_id: z.string().max(120).optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageRequestSchema>;

const loadMessagesSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

export type LoadMessagesParams = z.infer<typeof loadMessagesSchema>;

export function fetchChannelMessages(
  channelId: string,
  params?: LoadMessagesParams,
): Promise<MessagePage> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.cursor) searchParams.set('cursor', params.cursor);

  const qs = searchParams.toString();
  const path = `/channels/${channelId}/messages${qs ? `?${qs}` : ''}`;

  return request<MessagePage>('GET', path, { schema: messagePageSchema });
}

export function sendChannelMessage(
  channelId: string,
  data: SendMessageInput,
): Promise<Message> {
  return request<Message>('POST', `/channels/${channelId}/messages`, {
    body: data,
    schema: messageSchema,
  });
}

export function fetchDmMessages(
  conversationId: string,
  params?: LoadMessagesParams,
): Promise<MessagePage> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.cursor) searchParams.set('cursor', params.cursor);

  const qs = searchParams.toString();
  const path = `/dm-conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`;

  return request<MessagePage>('GET', path, { schema: messagePageSchema });
}

export function sendDmMessage(
  conversationId: string,
  data: SendMessageInput,
): Promise<Message> {
  return request<Message>('POST', `/dm-conversations/${conversationId}/messages`, {
    body: data,
    schema: messageSchema,
  });
}

const markReadSchema = z.object({
  scope_type: z.enum(['channel', 'dm']),
  channel_id: z.string().uuid().optional(),
  conversation_id: z.string().uuid().optional(),
  last_read_message_id: z.string().uuid(),
});

export type MarkReadInput = z.infer<typeof markReadSchema>;

export function markRead(data: MarkReadInput): Promise<{ ok: true }> {
  return request<{ ok: true }>('POST', '/read-states', {
    body: data,
    schema: z.object({ ok: z.literal(true) }),
  });
}

export function deleteMessage(
  messageId: string,
  operation: 'retract' | 'delete',
  reason?: string,
): Promise<Message> {
  return request<Message>('POST', `/messages/${messageId}/delete`, {
    body: { operation, reason: reason ?? null },
    schema: messageSchema,
  });
}
