export type UserSummary = {
  account_status: string;
  avatar_attachment_id: string | null;
  bio: string | null;
  created_at: string;
  nickname: string;
  presence_status: string;
  user_id: string;
  username: string;
};

export type UserPublicRecord = {
  accountStatus: string;
  avatarAttachmentId: string | null;
  bio: string | null;
  createdAt: Date;
  id: string;
  nickname: string;
  presenceStatus: string;
  username: string;
};

export type UserRecord = UserPublicRecord & {
  emailOrPhone: string;
  passwordHash: string;
};

export type UserSearchRelationshipStatus =
  | 'accepted'
  | 'none'
  | 'pending_incoming'
  | 'pending_outgoing'
  | 'self';

export type UserSearchRow = UserPublicRecord & {
  relationshipStatus: string;
};

export type UserSearchResult = {
  relationship_status: UserSearchRelationshipStatus;
  user: UserSummary;
};

export function toUserSummary(user: UserPublicRecord): UserSummary {
  return {
    account_status: user.accountStatus,
    avatar_attachment_id: user.avatarAttachmentId,
    bio: user.bio,
    created_at: user.createdAt.toISOString(),
    nickname: user.nickname,
    presence_status: user.presenceStatus,
    user_id: user.id,
    username: user.username,
  };
}

export function toUserSearchResult(row: UserSearchRow): UserSearchResult {
  return {
    relationship_status: toRelationshipStatus(row.relationshipStatus),
    user: toUserSummary(row),
  };
}

function toRelationshipStatus(value: string): UserSearchRelationshipStatus {
  if (
    value === 'accepted' ||
    value === 'pending_incoming' ||
    value === 'pending_outgoing' ||
    value === 'self'
  ) {
    return value;
  }

  return 'none';
}
