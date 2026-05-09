export type VoiceSessionRow = {
  avatarAttachmentId: string | null;
  channelId: string;
  connectionStatus: string;
  deafenState: boolean;
  id: string;
  joinedAt: Date;
  mediaState: string;
  muteState: boolean;
  producerId: string | null;
  recvTransportId: string | null;
  routerId: string | null;
  sendTransportId: string | null;
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
  media_state: string;
  member: {
    avatar_attachment_id: string | null;
    nickname: string;
    user_id: string;
    username: string;
  };
  mute_state: boolean;
  producer_id: string | null;
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
    media_state: row.mediaState,
    member: {
      avatar_attachment_id: row.avatarAttachmentId,
      nickname: row.userNickname,
      user_id: row.userId,
      username: row.username,
    },
    mute_state: row.muteState,
    producer_id: row.producerId,
    session_id: row.id,
    updated_at: row.updatedAt.toISOString(),
    user_id: row.userId,
  };
}
