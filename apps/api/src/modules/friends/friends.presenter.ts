export type FriendUserSummary = {
  account_status: string;
  avatar_attachment_id: string | null;
  bio: string | null;
  created_at: string;
  nickname: string;
  presence_status: string;
  user_id: string;
  username: string;
};

export type FriendshipSummary = {
  conversation_id: string | null;
  direction: 'incoming' | 'outgoing';
  friend: FriendUserSummary;
  friendship_id: string;
  status: string;
};

export type DirectConversationSummary = {
  conversation_id: string;
  friend: FriendUserSummary;
  last_message_id: string | null;
};

export type FriendUserRow = {
  friendAccountStatus: string;
  friendAvatarAttachmentId: string | null;
  friendBio: string | null;
  friendCreatedAt: Date;
  friendId: string;
  friendNickname: string;
  friendPresenceStatus: string;
  friendUsername: string;
};

export type FriendshipRow = FriendUserRow & {
  addresseeId: string;
  conversationId: string | null;
  friendshipId: string;
  requesterId: string;
  status: string;
};

export type DirectConversationRow = FriendUserRow & {
  conversationId: string;
  lastMessageId: string | null;
};

export function toFriendUserSummary(row: FriendUserRow): FriendUserSummary {
  return {
    account_status: row.friendAccountStatus,
    avatar_attachment_id: row.friendAvatarAttachmentId,
    bio: row.friendBio,
    created_at: row.friendCreatedAt.toISOString(),
    nickname: row.friendNickname,
    presence_status: row.friendPresenceStatus,
    user_id: row.friendId,
    username: row.friendUsername,
  };
}

export function toFriendshipSummary(row: FriendshipRow, currentUserId: string): FriendshipSummary {
  return {
    conversation_id: row.conversationId,
    direction: row.requesterId === currentUserId ? 'outgoing' : 'incoming',
    friend: toFriendUserSummary(row),
    friendship_id: row.friendshipId,
    status: row.status,
  };
}

export function toDirectConversationSummary(row: DirectConversationRow): DirectConversationSummary {
  return {
    conversation_id: row.conversationId,
    friend: toFriendUserSummary(row),
    last_message_id: row.lastMessageId,
  };
}
