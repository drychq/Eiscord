import { z } from 'zod';
import { request } from '../../shared/api/http-client';

const friendUserSummarySchema = z.object({
  account_status: z.string(),
  avatar_attachment_id: z.string().uuid().nullable(),
  bio: z.string().nullable(),
  created_at: z.string(),
  nickname: z.string(),
  presence_status: z.string(),
  user_id: z.string().uuid(),
  username: z.string(),
});

const friendshipSummarySchema = z.object({
  conversation_id: z.string().uuid().nullable(),
  direction: z.enum(['incoming', 'outgoing']),
  friend: friendUserSummarySchema,
  friendship_id: z.string().uuid(),
  status: z.string(),
});

const directConversationSummarySchema = z.object({
  conversation_id: z.string().uuid(),
  friend: friendUserSummarySchema,
  last_message_id: z.string().uuid().nullable(),
});

export type FriendUserSummary = z.infer<typeof friendUserSummarySchema>;
export type FriendshipSummary = z.infer<typeof friendshipSummarySchema>;
export type DirectConversationSummary = z.infer<typeof directConversationSummarySchema>;

export function fetchFriends(): Promise<FriendshipSummary[]> {
  return request<FriendshipSummary[]>('GET', '/friends', {
    schema: z.array(friendshipSummarySchema),
  });
}

export function createFriendRequest(targetUserId: string): Promise<FriendshipSummary> {
  return request<FriendshipSummary>('POST', '/friend-requests', {
    body: { target_user_id: targetUserId },
    schema: friendshipSummarySchema,
  });
}

export function acceptFriendRequest(friendshipId: string): Promise<FriendshipSummary> {
  return request<FriendshipSummary>('POST', `/friend-requests/${friendshipId}/accept`, {
    schema: friendshipSummarySchema,
  });
}

export function rejectFriendRequest(friendshipId: string): Promise<FriendshipSummary> {
  return request<FriendshipSummary>('POST', `/friend-requests/${friendshipId}/reject`, {
    schema: friendshipSummarySchema,
  });
}

export function fetchDmConversations(): Promise<DirectConversationSummary[]> {
  return request<DirectConversationSummary[]>('GET', '/dm-conversations', {
    schema: z.array(directConversationSummarySchema),
  });
}
