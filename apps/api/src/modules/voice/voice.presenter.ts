export type VoiceSessionRow = {
  avatarAttachmentId: string | null;
  channelId: string;
  connectionStatus: string;
  deafenState: boolean;
  id: string;
  joinedAt: Date;
  muteState: boolean;
  updatedAt: Date;
  userId: string;
  userNickname: string;
  username: string;
};

export type VoiceSessionSummary = {
  channel_id: string;
  connection_status: string;
  deafen_state: boolean;
  joined_at: string;
  member: {
    avatar_attachment_id: string | null;
    nickname: string;
    user_id: string;
    username: string;
  };
  mute_state: boolean;
  session_id: string;
  updated_at: string;
  user_id: string;
};

export function toVoiceSessionSummary(row: VoiceSessionRow): VoiceSessionSummary {
  return {
    channel_id: row.channelId,
    connection_status: row.connectionStatus,
    deafen_state: row.deafenState,
    joined_at: row.joinedAt.toISOString(),
    member: {
      avatar_attachment_id: row.avatarAttachmentId,
      nickname: row.userNickname,
      user_id: row.userId,
      username: row.username,
    },
    mute_state: row.muteState,
    session_id: row.id,
    updated_at: row.updatedAt.toISOString(),
    user_id: row.userId,
  };
}
