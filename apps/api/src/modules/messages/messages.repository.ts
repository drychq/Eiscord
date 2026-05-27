import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../common/persistence/prisma.service';
import type { RawSqlExecutor } from '../../common/persistence/types';
import type {
  MessageAttachmentRow,
  MessageMentionRow,
  MessageRow,
  ReadStateRow,
} from './messages.presenter';

export type ChannelAccessRow = {
  channelId: string;
  serverId: string;
};

export type DirectConversationAccessRow = {
  conversationId: string;
  participantAId: string;
  participantBId: string;
};

export type UnreadRow = {
  lastReadMessageId: string | null;
  unreadCount: number;
  userId: string;
};

export type DeleteMessageRow = MessageRow & {
  deletedAt: Date | null;
};

export type CurrentReadStateRow = ReadStateRow & {
  lastReadCreatedAt: Date | null;
};

export type InsertMessageInput = {
  channelId: string | null;
  clientMessageId: string | null;
  content: string | null;
  conversationId: string | null;
  scopeType: 'channel' | 'dm';
  senderId: string;
};

export type LoadMessagesCursor = {
  createdAt: string | null;
  id: string | null;
};

@Injectable()
export class MessagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveTextChannel(channelId: string): Promise<ChannelAccessRow | null> {
    return this.prisma.$queryRaw<ChannelAccessRow[]>`
      SELECT c.id AS "channelId", c.server_id AS "serverId"
      FROM channels c
      INNER JOIN servers s ON s.id = c.server_id
      WHERE c.id = ${channelId}::uuid
        AND c.status = 'active'
        AND c.type = 'text'
        AND s.status = 'active'
      LIMIT 1
    `.then((rows) => rows[0] ?? null);
  }

  findDirectConversationForUser(
    executor: RawSqlExecutor,
    userId: string,
    conversationId: string,
  ): Promise<DirectConversationAccessRow | null> {
    return executor.$queryRaw<DirectConversationAccessRow[]>`
      SELECT
        id AS "conversationId",
        participant_a_id AS "participantAId",
        participant_b_id AS "participantBId"
      FROM direct_conversations
      WHERE id = ${conversationId}::uuid
        AND (
          participant_a_id = ${userId}::uuid
          OR participant_b_id = ${userId}::uuid
        )
      LIMIT 1
    `.then((rows) => rows[0] ?? null);
  }

  findExistingChannelMessage(
    executor: RawSqlExecutor,
    senderId: string,
    channelId: string,
    clientMessageId: string,
  ): Promise<MessageRow | null> {
    return executor.$queryRaw<MessageRow[]>`
      SELECT
        msg.id,
        msg.scope_type AS "scopeType",
        msg.channel_id AS "channelId",
        msg.conversation_id AS "conversationId",
        msg.sender_id AS "senderId",
        msg.content,
        msg.visibility,
        msg.created_at AS "createdAt",
        u.username AS "senderUsername",
        u.nickname AS "senderNickname",
        u.avatar_attachment_id AS "avatarAttachmentId"
      FROM messages msg
      INNER JOIN users u ON u.id = msg.sender_id
      WHERE msg.sender_id = ${senderId}::uuid
        AND msg.channel_id = ${channelId}::uuid
        AND msg.client_message_id = ${clientMessageId}
      LIMIT 1
    `.then((rows) => rows[0] ?? null);
  }

  findExistingDirectMessage(
    executor: RawSqlExecutor,
    senderId: string,
    conversationId: string,
    clientMessageId: string,
  ): Promise<MessageRow | null> {
    return executor.$queryRaw<MessageRow[]>`
      SELECT
        msg.id,
        msg.scope_type AS "scopeType",
        msg.channel_id AS "channelId",
        msg.conversation_id AS "conversationId",
        msg.sender_id AS "senderId",
        msg.content,
        msg.visibility,
        msg.created_at AS "createdAt",
        u.username AS "senderUsername",
        u.nickname AS "senderNickname",
        u.avatar_attachment_id AS "avatarAttachmentId"
      FROM messages msg
      INNER JOIN users u ON u.id = msg.sender_id
      WHERE msg.sender_id = ${senderId}::uuid
        AND msg.conversation_id = ${conversationId}::uuid
        AND msg.client_message_id = ${clientMessageId}
      LIMIT 1
    `.then((rows) => rows[0] ?? null);
  }

  async insertMessage(
    executor: RawSqlExecutor,
    input: InsertMessageInput,
  ): Promise<MessageRow> {
    const messageId = randomUUID();

    await executor.$executeRaw`
      INSERT INTO messages (
        id,
        scope_type,
        channel_id,
        conversation_id,
        sender_id,
        content,
        visibility,
        client_message_id
      )
      VALUES (
        ${messageId}::uuid,
        ${input.scopeType},
        ${input.channelId}::uuid,
        ${input.conversationId}::uuid,
        ${input.senderId}::uuid,
        ${input.content},
        'visible',
        ${input.clientMessageId}
      )
    `;

    const message = await this.findMessageById(executor, messageId);

    if (!message) {
      throw new Error('Inserted message could not be reloaded.');
    }

    return message;
  }

  findMessageById(executor: RawSqlExecutor, messageId: string): Promise<MessageRow | null> {
    return executor.$queryRaw<MessageRow[]>`
      SELECT
        msg.id,
        msg.scope_type AS "scopeType",
        msg.channel_id AS "channelId",
        msg.conversation_id AS "conversationId",
        msg.sender_id AS "senderId",
        msg.content,
        msg.visibility,
        msg.created_at AS "createdAt",
        u.username AS "senderUsername",
        u.nickname AS "senderNickname",
        u.avatar_attachment_id AS "avatarAttachmentId"
      FROM messages msg
      INNER JOIN users u ON u.id = msg.sender_id
      WHERE msg.id = ${messageId}::uuid
      LIMIT 1
    `.then((rows) => rows[0] ?? null);
  }

  findReadyMessageAttachment(
    executor: RawSqlExecutor,
    attachmentId: string,
    ownerId: string,
  ): Promise<{ id: string } | null> {
    return executor.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM attachments
      WHERE id = ${attachmentId}::uuid
        AND owner_id = ${ownerId}::uuid
        AND purpose = 'message'
        AND status = 'ready'
      LIMIT 1
    `.then((rows) => rows[0] ?? null);
  }

  findServerMembership(
    executor: RawSqlExecutor,
    serverId: string,
    userId: string,
  ): Promise<{ userId: string } | null> {
    return executor.$queryRaw<{ userId: string }[]>`
      SELECT user_id AS "userId"
      FROM memberships
      WHERE server_id = ${serverId}::uuid
        AND user_id = ${userId}::uuid
        AND member_status IN ('active', 'muted')
      LIMIT 1
    `.then((rows) => rows[0] ?? null);
  }

  async insertMessageAttachments(
    executor: RawSqlExecutor,
    messageId: string,
    attachmentIds: string[],
  ): Promise<void> {
    for (const attachmentId of attachmentIds) {
      await executor.$executeRaw`
        INSERT INTO message_attachments (message_id, attachment_id)
        VALUES (${messageId}::uuid, ${attachmentId}::uuid)
        ON CONFLICT (message_id, attachment_id) DO NOTHING
      `;
    }
  }

  async insertMessageMentions(
    executor: RawSqlExecutor,
    messageId: string,
    mentionUserIds: string[],
  ): Promise<void> {
    for (const userId of mentionUserIds) {
      await executor.$executeRaw`
        INSERT INTO message_mentions (message_id, mentioned_user_id)
        VALUES (${messageId}::uuid, ${userId}::uuid)
        ON CONFLICT (message_id, mentioned_user_id) DO NOTHING
      `;
    }
  }

  async updateDirectConversationLastMessage(
    executor: RawSqlExecutor,
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    await executor.$executeRaw`
      UPDATE direct_conversations
      SET last_message_id = ${messageId}::uuid, updated_at = NOW()
      WHERE id = ${conversationId}::uuid
    `;
  }

  async markSenderReadChannel(
    executor: RawSqlExecutor,
    userId: string,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    await executor.$executeRaw`
      INSERT INTO read_states (
        id,
        user_id,
        scope_type,
        channel_id,
        last_read_message_id,
        unread_count
      )
      VALUES (gen_random_uuid(), ${userId}::uuid, 'channel', ${channelId}::uuid, ${messageId}::uuid, 0)
      ON CONFLICT (user_id, channel_id)
      DO UPDATE SET
        last_read_message_id = ${messageId}::uuid,
        unread_count = 0,
        updated_at = NOW()
    `;
  }

  async markSenderReadDirect(
    executor: RawSqlExecutor,
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    await executor.$executeRaw`
      INSERT INTO read_states (
        id,
        user_id,
        scope_type,
        conversation_id,
        last_read_message_id,
        unread_count
      )
      VALUES (gen_random_uuid(), ${userId}::uuid, 'dm', ${conversationId}::uuid, ${messageId}::uuid, 0)
      ON CONFLICT (user_id, conversation_id)
      DO UPDATE SET
        last_read_message_id = ${messageId}::uuid,
        unread_count = 0,
        updated_at = NOW()
    `;
  }

  incrementChannelUnread(
    executor: RawSqlExecutor,
    channelId: string,
    recipients: string[],
  ): Promise<UnreadRow[]> {
    if (recipients.length === 0) {
      return Promise.resolve([]);
    }

    return executor.$queryRaw<UnreadRow[]>`
      INSERT INTO read_states (id, user_id, scope_type, channel_id, last_read_message_id, unread_count)
      SELECT gen_random_uuid(), user_id, 'channel', ${channelId}::uuid, null, 1
      FROM unnest(${recipients}::uuid[]) AS readable(user_id)
      ON CONFLICT (user_id, channel_id)
      DO UPDATE SET
        unread_count = read_states.unread_count + 1,
        updated_at = NOW()
      RETURNING
        user_id AS "userId",
        unread_count AS "unreadCount",
        last_read_message_id AS "lastReadMessageId"
    `;
  }

  async incrementDirectUnread(
    executor: RawSqlExecutor,
    conversationId: string,
    userId: string,
  ): Promise<UnreadRow> {
    const [row] = await executor.$queryRaw<UnreadRow[]>`
      INSERT INTO read_states (id, user_id, scope_type, conversation_id, last_read_message_id, unread_count)
      VALUES (gen_random_uuid(), ${userId}::uuid, 'dm', ${conversationId}::uuid, null, 1)
      ON CONFLICT (user_id, conversation_id)
      DO UPDATE SET
        unread_count = read_states.unread_count + 1,
        updated_at = NOW()
      RETURNING
        user_id AS "userId",
        unread_count AS "unreadCount",
        last_read_message_id AS "lastReadMessageId"
    `;

    return row;
  }

  loadChannelMessages(
    channelId: string,
    cursor: LoadMessagesCursor,
    limit: number,
  ): Promise<MessageRow[]> {
    return this.prisma.$queryRaw<MessageRow[]>`
      SELECT
        msg.id,
        msg.scope_type AS "scopeType",
        msg.channel_id AS "channelId",
        msg.conversation_id AS "conversationId",
        msg.sender_id AS "senderId",
        msg.content,
        msg.visibility,
        msg.created_at AS "createdAt",
        u.username AS "senderUsername",
        u.nickname AS "senderNickname",
        u.avatar_attachment_id AS "avatarAttachmentId"
      FROM messages msg
      INNER JOIN users u ON u.id = msg.sender_id
      WHERE msg.channel_id = ${channelId}::uuid
        AND msg.visibility = 'visible'
        AND (
          ${cursor.createdAt}::timestamptz IS NULL
          OR msg.created_at < ${cursor.createdAt}::timestamptz
          OR (msg.created_at = ${cursor.createdAt}::timestamptz AND msg.id::text < ${cursor.id})
        )
      ORDER BY msg.created_at DESC, msg.id DESC
      LIMIT ${limit}
    `;
  }

  loadDirectMessages(
    conversationId: string,
    cursor: LoadMessagesCursor,
    limit: number,
  ): Promise<MessageRow[]> {
    return this.prisma.$queryRaw<MessageRow[]>`
      SELECT
        msg.id,
        msg.scope_type AS "scopeType",
        msg.channel_id AS "channelId",
        msg.conversation_id AS "conversationId",
        msg.sender_id AS "senderId",
        msg.content,
        msg.visibility,
        msg.created_at AS "createdAt",
        u.username AS "senderUsername",
        u.nickname AS "senderNickname",
        u.avatar_attachment_id AS "avatarAttachmentId"
      FROM messages msg
      INNER JOIN users u ON u.id = msg.sender_id
      WHERE msg.conversation_id = ${conversationId}::uuid
        AND msg.visibility = 'visible'
        AND (
          ${cursor.createdAt}::timestamptz IS NULL
          OR msg.created_at < ${cursor.createdAt}::timestamptz
          OR (msg.created_at = ${cursor.createdAt}::timestamptz AND msg.id::text < ${cursor.id})
        )
      ORDER BY msg.created_at DESC, msg.id DESC
      LIMIT ${limit}
    `;
  }

  loadMessageAttachments(
    executor: RawSqlExecutor,
    messageId: string,
  ): Promise<MessageAttachmentRow[]> {
    return executor.$queryRaw<MessageAttachmentRow[]>`
      SELECT
        ma.message_id AS "messageId",
        a.id AS "attachmentId",
        a.file_name AS "fileName",
        a.mime_type AS "mimeType",
        a.size_bytes AS "sizeBytes"
      FROM message_attachments ma
      INNER JOIN attachments a ON a.id = ma.attachment_id
      WHERE ma.message_id = ${messageId}::uuid
      ORDER BY ma.created_at ASC
    `;
  }

  loadMessageMentions(
    executor: RawSqlExecutor,
    messageId: string,
  ): Promise<MessageMentionRow[]> {
    return executor.$queryRaw<MessageMentionRow[]>`
      SELECT
        message_id AS "messageId",
        mentioned_user_id AS "mentionedUserId"
      FROM message_mentions
      WHERE message_id = ${messageId}::uuid
      ORDER BY created_at ASC
    `;
  }

  ensureChannelReadState(userId: string, channelId: string): Promise<ReadStateRow> {
    return this.prisma.$queryRaw<ReadStateRow[]>`
      INSERT INTO read_states (id, user_id, scope_type, channel_id, last_read_message_id, unread_count)
      VALUES (gen_random_uuid(), ${userId}::uuid, 'channel', ${channelId}::uuid, null, 0)
      ON CONFLICT (user_id, channel_id) DO UPDATE SET updated_at = read_states.updated_at
      RETURNING
        user_id AS "userId",
        scope_type AS "scopeType",
        channel_id AS "channelId",
        conversation_id AS "conversationId",
        last_read_message_id AS "lastReadMessageId",
        unread_count AS "unreadCount",
        updated_at AS "updatedAt"
    `.then((rows) => rows[0]);
  }

  ensureDirectReadState(userId: string, conversationId: string): Promise<ReadStateRow> {
    return this.prisma.$queryRaw<ReadStateRow[]>`
      INSERT INTO read_states (id, user_id, scope_type, conversation_id, last_read_message_id, unread_count)
      VALUES (gen_random_uuid(), ${userId}::uuid, 'dm', ${conversationId}::uuid, null, 0)
      ON CONFLICT (user_id, conversation_id) DO UPDATE SET updated_at = read_states.updated_at
      RETURNING
        user_id AS "userId",
        scope_type AS "scopeType",
        channel_id AS "channelId",
        conversation_id AS "conversationId",
        last_read_message_id AS "lastReadMessageId",
        unread_count AS "unreadCount",
        updated_at AS "updatedAt"
    `.then((rows) => rows[0]);
  }

  upsertChannelReadStateAtMessage(
    userId: string,
    channelId: string,
    lastReadMessageId: string,
    targetCreatedAt: Date,
  ): Promise<ReadStateRow> {
    return this.prisma.$queryRaw<ReadStateRow[]>`
      INSERT INTO read_states (
        id,
        user_id,
        scope_type,
        channel_id,
        last_read_message_id,
        unread_count
      )
      VALUES (
        gen_random_uuid(),
        ${userId}::uuid,
        'channel',
        ${channelId}::uuid,
        ${lastReadMessageId}::uuid,
        (
          SELECT COUNT(*)::int
          FROM messages
          WHERE channel_id = ${channelId}::uuid
            AND created_at > ${targetCreatedAt}
            AND sender_id <> ${userId}::uuid
            AND visibility = 'visible'
        )
      )
      ON CONFLICT (user_id, channel_id)
      DO UPDATE SET
        last_read_message_id = ${lastReadMessageId}::uuid,
        unread_count = (
          SELECT COUNT(*)::int
          FROM messages
          WHERE channel_id = ${channelId}::uuid
            AND created_at > ${targetCreatedAt}
            AND sender_id <> ${userId}::uuid
            AND visibility = 'visible'
        ),
        updated_at = NOW()
      RETURNING
        user_id AS "userId",
        scope_type AS "scopeType",
        channel_id AS "channelId",
        conversation_id AS "conversationId",
        last_read_message_id AS "lastReadMessageId",
        unread_count AS "unreadCount",
        updated_at AS "updatedAt"
    `.then((rows) => rows[0]);
  }

  upsertDirectReadStateAtMessage(
    userId: string,
    conversationId: string,
    lastReadMessageId: string,
    targetCreatedAt: Date,
  ): Promise<ReadStateRow> {
    return this.prisma.$queryRaw<ReadStateRow[]>`
      INSERT INTO read_states (
        id,
        user_id,
        scope_type,
        conversation_id,
        last_read_message_id,
        unread_count
      )
      VALUES (
        gen_random_uuid(),
        ${userId}::uuid,
        'dm',
        ${conversationId}::uuid,
        ${lastReadMessageId}::uuid,
        (
          SELECT COUNT(*)::int
          FROM messages
          WHERE conversation_id = ${conversationId}::uuid
            AND created_at > ${targetCreatedAt}
            AND sender_id <> ${userId}::uuid
            AND visibility = 'visible'
        )
      )
      ON CONFLICT (user_id, conversation_id)
      DO UPDATE SET
        last_read_message_id = ${lastReadMessageId}::uuid,
        unread_count = (
          SELECT COUNT(*)::int
          FROM messages
          WHERE conversation_id = ${conversationId}::uuid
            AND created_at > ${targetCreatedAt}
            AND sender_id <> ${userId}::uuid
            AND visibility = 'visible'
        ),
        updated_at = NOW()
      RETURNING
        user_id AS "userId",
        scope_type AS "scopeType",
        channel_id AS "channelId",
        conversation_id AS "conversationId",
        last_read_message_id AS "lastReadMessageId",
        unread_count AS "unreadCount",
        updated_at AS "updatedAt"
    `.then((rows) => rows[0]);
  }

  findMessageInScope(
    scopeType: 'channel' | 'dm',
    channelId: string | null,
    conversationId: string | null,
    messageId: string,
  ): Promise<MessageRow | null> {
    return this.prisma.$queryRaw<MessageRow[]>`
      SELECT
        msg.id,
        msg.scope_type AS "scopeType",
        msg.channel_id AS "channelId",
        msg.conversation_id AS "conversationId",
        msg.sender_id AS "senderId",
        msg.content,
        msg.visibility,
        msg.created_at AS "createdAt",
        u.username AS "senderUsername",
        u.nickname AS "senderNickname",
        u.avatar_attachment_id AS "avatarAttachmentId"
      FROM messages msg
      INNER JOIN users u ON u.id = msg.sender_id
      WHERE msg.id = ${messageId}::uuid
        AND msg.scope_type = ${scopeType}
        AND (${channelId}::uuid IS NULL OR msg.channel_id = ${channelId}::uuid)
        AND (${conversationId}::uuid IS NULL OR msg.conversation_id = ${conversationId}::uuid)
        AND msg.visibility = 'visible'
      LIMIT 1
    `.then((rows) => rows[0] ?? null);
  }

  findVisibleMessageWithDeletion(messageId: string): Promise<DeleteMessageRow | null> {
    return this.prisma.$queryRaw<DeleteMessageRow[]>`
      SELECT
        msg.id,
        msg.scope_type AS "scopeType",
        msg.channel_id AS "channelId",
        msg.conversation_id AS "conversationId",
        msg.sender_id AS "senderId",
        msg.content,
        msg.visibility,
        msg.created_at AS "createdAt",
        msg.deleted_at AS "deletedAt",
        u.username AS "senderUsername",
        u.nickname AS "senderNickname",
        u.avatar_attachment_id AS "avatarAttachmentId"
      FROM messages msg
      INNER JOIN users u ON u.id = msg.sender_id
      WHERE msg.id = ${messageId}::uuid
        AND msg.visibility = 'visible'
      LIMIT 1
    `.then((rows) => rows[0] ?? null);
  }

  markMessageDeleted(
    executor: RawSqlExecutor,
    messageId: string,
    visibility: 'retracted' | 'deleted',
  ): Promise<MessageRow | null> {
    return executor.$queryRaw<MessageRow[]>`
      UPDATE messages
      SET visibility = ${visibility}, deleted_at = NOW(), updated_at = NOW()
      WHERE id = ${messageId}::uuid
        AND visibility = 'visible'
      RETURNING
        id,
        scope_type AS "scopeType",
        channel_id AS "channelId",
        conversation_id AS "conversationId",
        sender_id AS "senderId",
        content,
        visibility,
        created_at AS "createdAt",
        (SELECT username FROM users WHERE id = messages.sender_id) AS "senderUsername",
        (SELECT nickname FROM users WHERE id = messages.sender_id) AS "senderNickname",
        (SELECT avatar_attachment_id FROM users WHERE id = messages.sender_id) AS "avatarAttachmentId"
    `.then((rows) => rows[0] ?? null);
  }

  recomputeChannelUnreadAfterDelete(
    executor: RawSqlExecutor,
    channelId: string,
  ): Promise<UnreadRow[]> {
    return executor.$queryRaw<UnreadRow[]>`
      UPDATE read_states rs
      SET
        unread_count = (
          SELECT COUNT(*)::int
          FROM messages msg
          WHERE msg.channel_id = ${channelId}::uuid
            AND msg.sender_id <> rs.user_id
            AND msg.visibility = 'visible'
            AND (
              rs.last_read_message_id IS NULL
              OR msg.created_at > (
                SELECT created_at
                FROM messages
                WHERE id = rs.last_read_message_id
              )
            )
        ),
        updated_at = NOW()
      WHERE rs.scope_type = 'channel'
        AND rs.channel_id = ${channelId}::uuid
      RETURNING
        rs.user_id AS "userId",
        rs.unread_count AS "unreadCount",
        rs.last_read_message_id AS "lastReadMessageId"
    `;
  }

  recomputeDirectUnreadAfterDelete(
    executor: RawSqlExecutor,
    conversationId: string,
  ): Promise<UnreadRow[]> {
    return executor.$queryRaw<UnreadRow[]>`
      UPDATE read_states rs
      SET
        unread_count = (
          SELECT COUNT(*)::int
          FROM messages msg
          WHERE msg.conversation_id = ${conversationId}::uuid
            AND msg.sender_id <> rs.user_id
            AND msg.visibility = 'visible'
            AND (
              rs.last_read_message_id IS NULL
              OR msg.created_at > (
                SELECT created_at
                FROM messages
                WHERE id = rs.last_read_message_id
              )
            )
        ),
        updated_at = NOW()
      WHERE rs.scope_type = 'dm'
        AND rs.conversation_id = ${conversationId}::uuid
      RETURNING
        rs.user_id AS "userId",
        rs.unread_count AS "unreadCount",
        rs.last_read_message_id AS "lastReadMessageId"
    `;
  }

  findCurrentReadState(
    userId: string,
    scopeType: 'channel' | 'dm',
    channelId: string | null,
    conversationId: string | null,
  ): Promise<CurrentReadStateRow | null> {
    return this.prisma.$queryRaw<CurrentReadStateRow[]>`
      SELECT
        rs.user_id AS "userId",
        rs.scope_type AS "scopeType",
        rs.channel_id AS "channelId",
        rs.conversation_id AS "conversationId",
        rs.last_read_message_id AS "lastReadMessageId",
        rs.unread_count AS "unreadCount",
        rs.updated_at AS "updatedAt",
        msg.created_at AS "lastReadCreatedAt"
      FROM read_states rs
      LEFT JOIN messages msg ON msg.id = rs.last_read_message_id
      WHERE rs.user_id = ${userId}::uuid
        AND rs.scope_type = ${scopeType}
        AND (${channelId}::uuid IS NULL OR rs.channel_id = ${channelId}::uuid)
        AND (${conversationId}::uuid IS NULL OR rs.conversation_id = ${conversationId}::uuid)
      LIMIT 1
    `.then((rows) => rows[0] ?? null);
  }
}
