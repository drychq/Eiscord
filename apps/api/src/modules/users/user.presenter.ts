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

export type UserRecord = {
  accountStatus: string;
  avatarAttachmentId: string | null;
  bio: string | null;
  createdAt: Date;
  emailOrPhone: string;
  id: string;
  nickname: string;
  passwordHash: string;
  presenceStatus: string;
  username: string;
};

export function toUserSummary(user: UserRecord): UserSummary {
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
