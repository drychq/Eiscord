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

const userSearchResultSchema = z.object({
  relationship_status: z.enum([
    'accepted',
    'none',
    'pending_incoming',
    'pending_outgoing',
    'self',
  ]),
  user: friendUserSummarySchema,
});

export type CreateFriendRequestInput =
  | { target_user_id: string; target_username?: never }
  | { target_username: string; target_user_id?: never };

export type FriendUserSummary = z.infer<typeof friendUserSummarySchema>;
export type FriendshipSummary = z.infer<typeof friendshipSummarySchema>;
export type DirectConversationSummary = z.infer<typeof directConversationSummarySchema>;
export type UserSearchResult = z.infer<typeof userSearchResultSchema>;

export function fetchFriends(): Promise<FriendshipSummary[]> {
  return request<FriendshipSummary[]>('GET', '/friends', {
    schema: z.array(friendshipSummarySchema),
  });
}

export function searchUsers(query: string, limit = 10): Promise<UserSearchResult[]> {
  const searchParams = new URLSearchParams();
  searchParams.set('q', query);
  searchParams.set('limit', String(limit));

  return request<UserSearchResult[]>('GET', `/users/search?${searchParams.toString()}`, {
    schema: z.array(userSearchResultSchema),
  });
}

export function createFriendRequest(input: CreateFriendRequestInput): Promise<FriendshipSummary> {
  return request<FriendshipSummary>('POST', '/friend-requests', {
    body: input,
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
