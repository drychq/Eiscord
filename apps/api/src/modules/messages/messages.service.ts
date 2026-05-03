import { randomUUID } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';

import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateNotificationResult } from '../notifications/notifications.service';
import { buildRealtimeRoom, buildUserRoom } from '../realtime/realtime.rooms';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { LoadMessagesDto } from './dto/load-messages.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { SendMessageDto } from './dto/send-message.dto';
import {
  MessageAttachmentRow,
  MessageListResponse,
  MessageMentionRow,
  MessageRow,
  MessageSummary,
  ReadStateRow,
  toMessageSummary,
  toReadStateSummary,
} from './messages.presenter';

type RawSqlExecutor = Pick<PrismaService, '$executeRaw' | '$queryRaw'>;

type ChannelAccessRow = {
  channelId: string;
  serverId: string;
};

type DirectConversationAccessRow = {
  conversationId: string;
  participantAId: string;
  participantBId: string;
};

type Cursor = {
  created_at: string;
  id: string;
};

type NormalizedSendInput = {
  attachmentIds: string[];
  clientMessageId: string | null;
  content: string | null;
  mentionUserIds: string[];
};

type UnreadRow = {
  lastReadMessageId: string | null;
  unreadCount: number;
  userId: string;
};

type CurrentReadStateRow = ReadStateRow & {
  lastReadCreatedAt: Date | null;
};

@Injectable()
export class MessagesService {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly realtimePublisher: RealtimePublisher,
  ) {}

  async sendChannelMessage(
    user: AuthenticatedUserContext,
    channelId: string,
    dto: SendMessageDto,
    requestId?: string,
  ): Promise<MessageSummary> {
    const input = normalizeSendInput(dto);
    const result = await this.prisma.$transaction(async (tx) => {
      const channel = await this.getChannelForSend(tx, user.userId, channelId);
      const existing = await this.getExistingChannelMessage(
        tx,
        user.userId,
        channelId,
        input.clientMessageId,
      );

      if (existing) {
        return { created: false, message: existing, notifications: [], unreadRows: [] };
      }

      await this.assertReadyMessageAttachments(tx, user.userId, input.attachmentIds);
      const mentionUserIds = await this.filterChannelMentionUsers(
        tx,
        channel.serverId,
        input.mentionUserIds,
      );
      const message = await this.insertMessage(tx, {
        channelId,
        clientMessageId: input.clientMessageId,
        content: input.content,
        conversationId: null,
        scopeType: 'channel',
        senderId: user.userId,
      });
      await this.insertMessageAttachments(tx, message.id, input.attachmentIds);
      await this.insertMessageMentions(tx, message.id, mentionUserIds);
      await this.markSenderRead(tx, user.userId, 'channel', channelId, null, message.id);
      const unreadRows = await this.incrementChannelUnread(tx, channel.serverId, channelId, user.userId);
      const notifications: CreateNotificationResult[] = [];

      for (const mentionedUserId of mentionUserIds.filter((id) => id !== user.userId)) {
        notifications.push(
          await this.notificationsService.createNotification(tx, {
            contentPreview: `${message.senderNickname} mentioned you`,
            dedupeKey: `message:${message.id}:mention:${mentionedUserId}`,
            sourceId: message.id,
            sourceType: 'message',
            type: 'channel_mention',
            userId: mentionedUserId,
          }),
        );
      }

      return { created: true, message, notifications, unreadRows };
    });
    const summary = await this.hydrateMessage(result.message);

    if (result.created) {
      this.publishMessageCreated(summary, buildRealtimeRoom('channel', channelId), requestId);
      this.publishUnreadUpdates(result.unreadRows, {
        channelId,
        conversationId: null,
        scopeType: 'channel',
      }, requestId);
      this.publishNotifications(result.notifications, requestId);
    }

    return summary;
  }

  async sendDirectMessage(
    user: AuthenticatedUserContext,
    conversationId: string,
    dto: SendMessageDto,
    requestId?: string,
  ): Promise<MessageSummary> {
    const input = normalizeSendInput(dto);
    const result = await this.prisma.$transaction(async (tx) => {
      const conversation = await this.getDirectConversationForSend(tx, user.userId, conversationId);
      const existing = await this.getExistingDirectMessage(
        tx,
        user.userId,
        conversationId,
        input.clientMessageId,
      );

      if (existing) {
        return { created: false, message: existing, notifications: [], unreadRows: [] };
      }

      await this.assertReadyMessageAttachments(tx, user.userId, input.attachmentIds);
      const mentionUserIds = filterDirectMentionUsers(input.mentionUserIds, conversation);
      const recipientId =
        conversation.participantAId === user.userId
          ? conversation.participantBId
          : conversation.participantAId;
      const message = await this.insertMessage(tx, {
        channelId: null,
        clientMessageId: input.clientMessageId,
        content: input.content,
        conversationId,
        scopeType: 'dm',
        senderId: user.userId,
      });
      await this.insertMessageAttachments(tx, message.id, input.attachmentIds);
      await this.insertMessageMentions(tx, message.id, mentionUserIds);
      await tx.$executeRaw`
        UPDATE direct_conversations
        SET last_message_id = ${message.id}::uuid, updated_at = NOW()
        WHERE id = ${conversationId}::uuid
      `;
      await this.markSenderRead(tx, user.userId, 'dm', null, conversationId, message.id);
      const unreadRows = [await this.incrementDirectUnread(tx, conversationId, recipientId)];
      const notification = await this.notificationsService.createNotification(tx, {
        contentPreview: `${message.senderNickname}: ${previewContent(input.content)}`,
        dedupeKey: `message:${message.id}:dm:${recipientId}`,
        sourceId: message.id,
        sourceType: 'message',
        type: 'direct_message',
        userId: recipientId,
      });

      return { created: true, message, notifications: [notification], unreadRows };
    });
    const summary = await this.hydrateMessage(result.message);

    if (result.created) {
      this.publishMessageCreated(summary, buildRealtimeRoom('dm', conversationId), requestId);
      this.publishUnreadUpdates(result.unreadRows, {
        channelId: null,
        conversationId,
        scopeType: 'dm',
      }, requestId);
      this.publishNotifications(result.notifications, requestId);
    }

    return summary;
  }

  async loadChannelMessages(
    user: AuthenticatedUserContext,
    channelId: string,
    dto: LoadMessagesDto,
  ): Promise<MessageListResponse> {
    await this.getChannelForRead(this.prisma, user.userId, channelId);
    const rows = await this.loadMessages('channel', channelId, dto);
    const page = rows.slice(0, pageLimit(dto));
    const readState = await this.ensureReadState(user.userId, 'channel', channelId, null);

    return {
      items: await Promise.all(page.map((row) => this.hydrateMessage(row))),
      next_cursor: rows.length > pageLimit(dto) ? encodeCursor(page[page.length - 1]) : null,
      read_state: toReadStateSummary(readState),
    };
  }

  async loadDirectMessages(
    user: AuthenticatedUserContext,
    conversationId: string,
    dto: LoadMessagesDto,
  ): Promise<MessageListResponse> {
    await this.getDirectConversationForRead(this.prisma, user.userId, conversationId);
    const rows = await this.loadMessages('dm', conversationId, dto);
    const page = rows.slice(0, pageLimit(dto));
    const readState = await this.ensureReadState(user.userId, 'dm', null, conversationId);

    return {
      items: await Promise.all(page.map((row) => this.hydrateMessage(row))),
      next_cursor: rows.length > pageLimit(dto) ? encodeCursor(page[page.length - 1]) : null,
      read_state: toReadStateSummary(readState),
    };
  }

  async markRead(
    user: AuthenticatedUserContext,
    dto: MarkReadDto,
    requestId?: string,
  ): Promise<ReturnType<typeof toReadStateSummary>> {
    if (dto.scope_type === 'channel') {
      if (!dto.channel_id) {
        throw new AppError(ErrorCode.ValidationFailed, 'channel_id is required.', HttpStatus.BAD_REQUEST);
      }

      await this.getChannelForRead(this.prisma, user.userId, dto.channel_id);
      const readState = await this.markScopeRead(
        user.userId,
        'channel',
        dto.channel_id,
        null,
        dto.last_read_message_id,
      );
      this.publishUnreadUpdates(
        [
          {
            lastReadMessageId: readState.lastReadMessageId,
            unreadCount: readState.unreadCount,
            userId: user.userId,
          },
        ],
        { channelId: dto.channel_id, conversationId: null, scopeType: 'channel' },
        requestId,
      );

      return toReadStateSummary(readState);
    }

    if (!dto.conversation_id) {
      throw new AppError(ErrorCode.ValidationFailed, 'conversation_id is required.', HttpStatus.BAD_REQUEST);
    }

    await this.getDirectConversationForRead(this.prisma, user.userId, dto.conversation_id);
    const readState = await this.markScopeRead(
      user.userId,
      'dm',
      null,
      dto.conversation_id,
      dto.last_read_message_id,
    );
    this.publishUnreadUpdates(
      [
        {
          lastReadMessageId: readState.lastReadMessageId,
          unreadCount: readState.unreadCount,
          userId: user.userId,
        },
      ],
      { channelId: null, conversationId: dto.conversation_id, scopeType: 'dm' },
      requestId,
    );

    return toReadStateSummary(readState);
  }

  private async getChannelForSend(
    tx: RawSqlExecutor,
    userId: string,
    channelId: string,
  ): Promise<ChannelAccessRow> {
    const [channel] = await tx.$queryRaw<ChannelAccessRow[]>`
      SELECT c.id AS "channelId", c.server_id AS "serverId"
      FROM channels c
      INNER JOIN servers s ON s.id = c.server_id
      INNER JOIN memberships m
        ON m.server_id = c.server_id
       AND m.user_id = ${userId}::uuid
      WHERE c.id = ${channelId}::uuid
        AND c.status = 'active'
        AND c.type = 'text'
        AND s.status = 'active'
        AND m.member_status = 'active'
      LIMIT 1
    `;

    if (!channel) {
      throw new AppError(ErrorCode.PermissionDenied, 'Permission denied.', HttpStatus.FORBIDDEN);
    }

    return channel;
  }

  private async getChannelForRead(
    tx: RawSqlExecutor,
    userId: string,
    channelId: string,
  ): Promise<ChannelAccessRow> {
    const [channel] = await tx.$queryRaw<ChannelAccessRow[]>`
      SELECT c.id AS "channelId", c.server_id AS "serverId"
      FROM channels c
      INNER JOIN servers s ON s.id = c.server_id
      INNER JOIN memberships m
        ON m.server_id = c.server_id
       AND m.user_id = ${userId}::uuid
      WHERE c.id = ${channelId}::uuid
        AND c.status = 'active'
        AND c.type = 'text'
        AND s.status = 'active'
        AND m.member_status IN ('active', 'muted')
      LIMIT 1
    `;

    if (!channel) {
      throw new AppError(ErrorCode.PermissionDenied, 'Permission denied.', HttpStatus.FORBIDDEN);
    }

    return channel;
  }

  private async getDirectConversationForSend(
    tx: RawSqlExecutor,
    userId: string,
    conversationId: string,
  ): Promise<DirectConversationAccessRow> {
    return this.getDirectConversationForRead(tx, userId, conversationId);
  }

  private async getDirectConversationForRead(
    tx: RawSqlExecutor,
    userId: string,
    conversationId: string,
  ): Promise<DirectConversationAccessRow> {
    const [conversation] = await tx.$queryRaw<DirectConversationAccessRow[]>`
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
    `;

    if (!conversation) {
      throw new AppError(ErrorCode.PermissionDenied, 'Permission denied.', HttpStatus.FORBIDDEN);
    }

    return conversation;
  }

  private async getExistingChannelMessage(
    tx: RawSqlExecutor,
    senderId: string,
    channelId: string,
    clientMessageId: string | null,
  ): Promise<MessageRow | null> {
    if (!clientMessageId) {
      return null;
    }

    const [message] = await tx.$queryRaw<MessageRow[]>`
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
    `;

    return message ?? null;
  }

  private async getExistingDirectMessage(
    tx: RawSqlExecutor,
    senderId: string,
    conversationId: string,
    clientMessageId: string | null,
  ): Promise<MessageRow | null> {
    if (!clientMessageId) {
      return null;
    }

    const [message] = await tx.$queryRaw<MessageRow[]>`
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
    `;

    return message ?? null;
  }

  private async insertMessage(
    tx: RawSqlExecutor,
    input: {
      channelId: string | null;
      clientMessageId: string | null;
      content: string | null;
      conversationId: string | null;
      scopeType: 'channel' | 'dm';
      senderId: string;
    },
  ): Promise<MessageRow> {
    const messageId = randomUUID();

    await tx.$executeRaw`
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

    return this.getMessageById(tx, messageId);
  }

  private async getMessageById(tx: RawSqlExecutor, messageId: string): Promise<MessageRow> {
    const [message] = await tx.$queryRaw<MessageRow[]>`
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
    `;

    return message;
  }

  private async assertReadyMessageAttachments(
    tx: RawSqlExecutor,
    userId: string,
    attachmentIds: string[],
  ) {
    for (const attachmentId of attachmentIds) {
      const [attachment] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM attachments
        WHERE id = ${attachmentId}::uuid
          AND owner_id = ${userId}::uuid
          AND purpose = 'message'
          AND status = 'ready'
        LIMIT 1
      `;

      if (!attachment) {
        throw new AppError(
          ErrorCode.ResourceNotFound,
          'Message attachment was not found.',
          HttpStatus.NOT_FOUND,
        );
      }
    }
  }

  private async filterChannelMentionUsers(
    tx: RawSqlExecutor,
    serverId: string,
    mentionUserIds: string[],
  ): Promise<string[]> {
    const validUserIds: string[] = [];

    for (const userId of mentionUserIds) {
      const [member] = await tx.$queryRaw<{ userId: string }[]>`
        SELECT user_id AS "userId"
        FROM memberships
        WHERE server_id = ${serverId}::uuid
          AND user_id = ${userId}::uuid
          AND member_status IN ('active', 'muted')
        LIMIT 1
      `;

      if (!member) {
        throw new AppError(
          ErrorCode.ResourceNotFound,
          'Mentioned user is not a member of this server.',
          HttpStatus.NOT_FOUND,
        );
      }

      validUserIds.push(member.userId);
    }

    return validUserIds;
  }

  private async insertMessageAttachments(
    tx: RawSqlExecutor,
    messageId: string,
    attachmentIds: string[],
  ) {
    for (const attachmentId of attachmentIds) {
      await tx.$executeRaw`
        INSERT INTO message_attachments (message_id, attachment_id)
        VALUES (${messageId}::uuid, ${attachmentId}::uuid)
        ON CONFLICT (message_id, attachment_id) DO NOTHING
      `;
    }
  }

  private async insertMessageMentions(
    tx: RawSqlExecutor,
    messageId: string,
    mentionUserIds: string[],
  ) {
    for (const userId of mentionUserIds) {
      await tx.$executeRaw`
        INSERT INTO message_mentions (message_id, mentioned_user_id)
        VALUES (${messageId}::uuid, ${userId}::uuid)
        ON CONFLICT (message_id, mentioned_user_id) DO NOTHING
      `;
    }
  }

  private async markSenderRead(
    tx: RawSqlExecutor,
    userId: string,
    scopeType: 'channel' | 'dm',
    channelId: string | null,
    conversationId: string | null,
    messageId: string,
  ) {
    if (scopeType === 'channel') {
      await tx.$executeRaw`
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
      return;
    }

    await tx.$executeRaw`
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

  private async incrementChannelUnread(
    tx: RawSqlExecutor,
    serverId: string,
    channelId: string,
    senderId: string,
  ): Promise<UnreadRow[]> {
    return tx.$queryRaw<UnreadRow[]>`
      INSERT INTO read_states (id, user_id, scope_type, channel_id, last_read_message_id, unread_count)
      SELECT gen_random_uuid(), m.user_id, 'channel', ${channelId}::uuid, null, 1
      FROM memberships m
      WHERE m.server_id = ${serverId}::uuid
        AND m.user_id <> ${senderId}::uuid
        AND m.member_status IN ('active', 'muted')
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

  private async incrementDirectUnread(
    tx: RawSqlExecutor,
    conversationId: string,
    userId: string,
  ): Promise<UnreadRow> {
    const [row] = await tx.$queryRaw<UnreadRow[]>`
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

  private async loadMessages(
    scopeType: 'channel' | 'dm',
    scopeId: string,
    dto: LoadMessagesDto,
  ): Promise<MessageRow[]> {
    const cursor = decodeCursor(dto.cursor);
    const cursorCreatedAt = cursor?.created_at ?? null;
    const cursorId = cursor?.id ?? null;
    const limit = pageLimit(dto);

    if (scopeType === 'channel') {
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
        WHERE msg.channel_id = ${scopeId}::uuid
          AND msg.visibility = 'visible'
          AND (
            ${cursorCreatedAt}::timestamptz IS NULL
            OR msg.created_at < ${cursorCreatedAt}::timestamptz
            OR (msg.created_at = ${cursorCreatedAt}::timestamptz AND msg.id::text < ${cursorId})
          )
        ORDER BY msg.created_at DESC, msg.id DESC
        LIMIT ${limit + 1}
      `;
    }

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
      WHERE msg.conversation_id = ${scopeId}::uuid
        AND msg.visibility = 'visible'
        AND (
          ${cursorCreatedAt}::timestamptz IS NULL
          OR msg.created_at < ${cursorCreatedAt}::timestamptz
          OR (msg.created_at = ${cursorCreatedAt}::timestamptz AND msg.id::text < ${cursorId})
        )
      ORDER BY msg.created_at DESC, msg.id DESC
      LIMIT ${limit + 1}
    `;
  }

  private async hydrateMessage(row: MessageRow): Promise<MessageSummary> {
    const [attachments, mentions] = await Promise.all([
      this.prisma.$queryRaw<MessageAttachmentRow[]>`
        SELECT
          ma.message_id AS "messageId",
          a.id AS "attachmentId",
          a.file_name AS "fileName",
          a.mime_type AS "mimeType",
          a.size_bytes AS "sizeBytes"
        FROM message_attachments ma
        INNER JOIN attachments a ON a.id = ma.attachment_id
        WHERE ma.message_id = ${row.id}::uuid
        ORDER BY ma.created_at ASC
      `,
      this.prisma.$queryRaw<MessageMentionRow[]>`
        SELECT
          message_id AS "messageId",
          mentioned_user_id AS "mentionedUserId"
        FROM message_mentions
        WHERE message_id = ${row.id}::uuid
        ORDER BY created_at ASC
      `,
    ]);

    return toMessageSummary(row, attachments, mentions);
  }

  private async ensureReadState(
    userId: string,
    scopeType: 'channel' | 'dm',
    channelId: string | null,
    conversationId: string | null,
  ): Promise<ReadStateRow> {
    if (scopeType === 'channel') {
      const [row] = await this.prisma.$queryRaw<ReadStateRow[]>`
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
      `;

      return row;
    }

    const [row] = await this.prisma.$queryRaw<ReadStateRow[]>`
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
    `;

    return row;
  }

  private async markScopeRead(
    userId: string,
    scopeType: 'channel' | 'dm',
    channelId: string | null,
    conversationId: string | null,
    lastReadMessageId: string,
  ): Promise<ReadStateRow> {
    const target = await this.getMessageForScope(scopeType, channelId, conversationId, lastReadMessageId);
    const current = await this.getCurrentReadState(userId, scopeType, channelId, conversationId);

    if (current?.lastReadCreatedAt && current.lastReadCreatedAt > target.createdAt) {
      throw new AppError(
        ErrorCode.Conflict,
        'Read state cannot move backwards.',
        HttpStatus.CONFLICT,
      );
    }

    if (scopeType === 'channel') {
      const [row] = await this.prisma.$queryRaw<ReadStateRow[]>`
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
              AND created_at > ${target.createdAt}
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
              AND created_at > ${target.createdAt}
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
      `;

      return row;
    }

    const [row] = await this.prisma.$queryRaw<ReadStateRow[]>`
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
            AND created_at > ${target.createdAt}
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
            AND created_at > ${target.createdAt}
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
    `;

    return row;
  }

  private async getMessageForScope(
    scopeType: 'channel' | 'dm',
    channelId: string | null,
    conversationId: string | null,
    messageId: string,
  ): Promise<MessageRow> {
    const [message] = await this.prisma.$queryRaw<MessageRow[]>`
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
    `;

    if (!message) {
      throw new AppError(
        ErrorCode.ResourceNotFound,
        'Read target message was not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    return message;
  }

  private async getCurrentReadState(
    userId: string,
    scopeType: 'channel' | 'dm',
    channelId: string | null,
    conversationId: string | null,
  ): Promise<CurrentReadStateRow | null> {
    const [row] = await this.prisma.$queryRaw<CurrentReadStateRow[]>`
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
    `;

    return row ?? null;
  }

  private publishMessageCreated(summary: MessageSummary, room: string, requestId?: string) {
    this.realtimePublisher.publishToRoom(room, RealtimeEvent.MessageCreated, summary, requestId);
  }

  private publishUnreadUpdates(
    rows: UnreadRow[],
    scope: { channelId: string | null; conversationId: string | null; scopeType: 'channel' | 'dm' },
    requestId?: string,
  ) {
    for (const row of rows) {
      this.realtimePublisher.publishToRoom(
        buildUserRoom(row.userId),
        RealtimeEvent.UnreadUpdated,
        {
          channel_id: scope.channelId,
          conversation_id: scope.conversationId,
          last_read_message_id: row.lastReadMessageId,
          scope_type: scope.scopeType,
          unread_count: row.unreadCount,
        },
        requestId,
      );
    }
  }

  private publishNotifications(results: CreateNotificationResult[], requestId?: string) {
    for (const result of results) {
      if (result.created) {
        this.notificationsService.publishCreated(result.notification, requestId);
      }
    }
  }
}

function normalizeSendInput(dto: SendMessageDto): NormalizedSendInput {
  const content = normalizeContent(dto.content);
  const attachmentIds = uniqueStrings(dto.attachment_ids ?? []);
  const mentionUserIds = uniqueStrings(dto.mention_user_ids ?? []);
  const clientMessageId = normalizeNullableString(dto.client_message_id);

  if (!content && attachmentIds.length === 0) {
    throw new AppError(
      ErrorCode.ValidationFailed,
      'Message content or attachment is required.',
      HttpStatus.BAD_REQUEST,
    );
  }

  return { attachmentIds, clientMessageId, content, mentionUserIds };
}

function normalizeContent(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function filterDirectMentionUsers(
  mentionUserIds: string[],
  conversation: DirectConversationAccessRow,
): string[] {
  const allowed = new Set([conversation.participantAId, conversation.participantBId]);

  for (const userId of mentionUserIds) {
    if (!allowed.has(userId)) {
      throw new AppError(
        ErrorCode.ResourceNotFound,
        'Mentioned user is not part of this conversation.',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  return mentionUserIds;
}

function previewContent(content: string | null): string {
  if (!content) {
    return 'Attachment';
  }

  return content.length > 120 ? `${content.slice(0, 117)}...` : content;
}

function pageLimit(dto: LoadMessagesDto): number {
  return Math.min(Math.max(dto.limit ?? 50, 1), 100);
}

function encodeCursor(row: MessageRow): string {
  return Buffer.from(
    JSON.stringify({
      created_at: row.createdAt.toISOString(),
      id: row.id,
    } satisfies Cursor),
  ).toString('base64url');
}

function decodeCursor(cursor: string | undefined): Cursor | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<Cursor>;

    if (
      typeof parsed.created_at === 'string' &&
      !Number.isNaN(Date.parse(parsed.created_at)) &&
      typeof parsed.id === 'string'
    ) {
      return { created_at: parsed.created_at, id: parsed.id };
    }
  } catch {
    // Fall through to the uniform validation error below.
  }

  throw new AppError(ErrorCode.ValidationFailed, 'Invalid cursor.', HttpStatus.BAD_REQUEST);
}
