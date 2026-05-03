export type MessageRow = {
  avatarAttachmentId: string | null;
  channelId: string | null;
  content: string | null;
  conversationId: string | null;
  createdAt: Date;
  id: string;
  scopeType: string;
  senderId: string;
  senderNickname: string;
  senderUsername: string;
  visibility: string;
};

export type MessageAttachmentRow = {
  attachmentId: string;
  fileName: string;
  messageId: string;
  mimeType: string;
  sizeBytes: number;
};

export type MessageMentionRow = {
  mentionedUserId: string;
  messageId: string;
};

export type ReadStateRow = {
  channelId: string | null;
  conversationId: string | null;
  lastReadMessageId: string | null;
  scopeType: string;
  unreadCount: number;
  updatedAt: Date;
  userId: string;
};

export type MessageSummary = {
  attachments: MessageAttachmentSummary[];
  channel_id: string | null;
  content: string | null;
  conversation_id: string | null;
  created_at: string;
  mentions: string[];
  message_id: string;
  scope_type: string;
  sender: {
    avatar_attachment_id: string | null;
    nickname: string;
    user_id: string;
    username: string;
  };
  visibility: string;
};

export type MessageAttachmentSummary = {
  attachment_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
};

export type ReadStateSummary = {
  channel_id: string | null;
  conversation_id: string | null;
  last_read_message_id: string | null;
  scope_type: string;
  unread_count: number;
  updated_at: string;
};

export type MessageListResponse = {
  items: MessageSummary[];
  next_cursor: string | null;
  read_state: ReadStateSummary;
};

export function toMessageSummary(
  row: MessageRow,
  attachments: MessageAttachmentRow[],
  mentions: MessageMentionRow[],
): MessageSummary {
  return {
    attachments: attachments.map((attachment) => ({
      attachment_id: attachment.attachmentId,
      file_name: attachment.fileName,
      mime_type: attachment.mimeType,
      size_bytes: attachment.sizeBytes,
    })),
    channel_id: row.channelId,
    content: row.content,
    conversation_id: row.conversationId,
    created_at: row.createdAt.toISOString(),
    mentions: mentions.map((mention) => mention.mentionedUserId),
    message_id: row.id,
    scope_type: row.scopeType,
    sender: {
      avatar_attachment_id: row.avatarAttachmentId,
      nickname: row.senderNickname,
      user_id: row.senderId,
      username: row.senderUsername,
    },
    visibility: row.visibility,
  };
}

export function toReadStateSummary(row: ReadStateRow): ReadStateSummary {
  return {
    channel_id: row.channelId,
    conversation_id: row.conversationId,
    last_read_message_id: row.lastReadMessageId,
    scope_type: row.scopeType,
    unread_count: row.unreadCount,
    updated_at: row.updatedAt.toISOString(),
  };
}
