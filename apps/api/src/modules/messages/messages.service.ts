import { HttpStatus, Injectable } from '@nestjs/common';

import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { AppError } from '../../common/errors/app-error';
import type { EventCollector } from '../../common/persistence/event-collector';
import { PersistenceCoordinator } from '../../common/persistence/persistence-coordinator.service';
import { PrismaService } from '../../common/persistence/prisma.service';
import type { RawSqlExecutor } from '../../common/persistence/types';
import { PermissionAction } from '../../common/permissions/permission.types';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { buildRealtimeRoom, buildUserRoom } from '../realtime/realtime.rooms';
import { DeleteMessageDto } from './dto/delete-message.dto';
import { LoadMessagesDto } from './dto/load-messages.dto';
import { MarkReadDto } from './dto/mark-read.dto';
import { SendMessageDto } from './dto/send-message.dto';
import {
  MessageListResponse,
  MessageRow,
  MessageSummary,
  ReadStateRow,
  toMessageSummary,
  toReadStateSummary,
} from './messages.presenter';
import {
  MessagesRepository,
  type ChannelAccessRow,
  type DirectConversationAccessRow,
  type UnreadRow,
} from './messages.repository';

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

type UnreadScope = {
  channelId: string | null;
  conversationId: string | null;
  scopeType: 'channel' | 'dm';
};

@Injectable()
export class MessagesService {
  constructor(
    private readonly messagesRepo: MessagesRepository,
    private readonly notificationsService: NotificationsService,
    private readonly permissionsService: PermissionsService,
    private readonly persistence: PersistenceCoordinator,
    private readonly prisma: PrismaService,
  ) {}

  async sendChannelMessage(
    user: AuthenticatedUserContext,
    channelId: string,
    dto: SendMessageDto,
    requestId?: string,
  ): Promise<MessageSummary> {
    const input = normalizeSendInput(dto);
    const channel = await this.getChannelForSend(user, channelId, requestId);
    const readableUserIds = await this.permissionsService.listUsersWithChannelPermission(
      channelId,
      PermissionAction.ViewChannel,
    );

    return this.persistence.runWithEvents(async (tx, events) => {
      const existing = input.clientMessageId
        ? await this.messagesRepo.findExistingChannelMessage(
            tx,
            user.userId,
            channelId,
            input.clientMessageId,
          )
        : null;

      if (existing) {
        return this.hydrateMessage(tx, existing);
      }

      await this.assertReadyMessageAttachments(tx, user.userId, input.attachmentIds);
      const mentionUserIds = await this.filterChannelMentionUsers(
        tx,
        channel.serverId,
        input.mentionUserIds,
        readableUserIds,
      );
      const message = await this.messagesRepo.insertMessage(tx, {
        channelId,
        clientMessageId: input.clientMessageId,
        content: input.content,
        conversationId: null,
        scopeType: 'channel',
        senderId: user.userId,
      });
      await this.messagesRepo.insertMessageAttachments(tx, message.id, input.attachmentIds);
      await this.messagesRepo.insertMessageMentions(tx, message.id, mentionUserIds);
      await this.messagesRepo.markSenderReadChannel(tx, user.userId, channelId, message.id);
      const recipients = readableUserIds.filter((userId) => userId !== user.userId);
      const unreadRows = await this.messagesRepo.incrementChannelUnread(tx, channelId, recipients);
      const summary = await this.hydrateMessage(tx, message);
      const room = buildRealtimeRoom('channel', channelId);

      events.publish(room, RealtimeEvent.MessageCreated, summary, requestId);
      this.enqueueUnreadEvents(
        events,
        unreadRows,
        { channelId, conversationId: null, scopeType: 'channel' },
        requestId,
      );

      for (const mentionedUserId of mentionUserIds.filter((id) => id !== user.userId)) {
        const notifResult = await this.notificationsService.createNotification(tx, {
          contentPreview: `${message.senderNickname} mentioned you`,
          dedupeKey: `message:${message.id}:mention:${mentionedUserId}`,
          sourceId: message.id,
          sourceType: 'message',
          type: 'channel_mention',
          userId: mentionedUserId,
        });
        if (notifResult.created) {
          this.notificationsService.publishCreated(events, notifResult.notification, requestId);
        }
      }

      return summary;
    });
  }

  async sendDirectMessage(
    user: AuthenticatedUserContext,
    conversationId: string,
    dto: SendMessageDto,
    requestId?: string,
  ): Promise<MessageSummary> {
    const input = normalizeSendInput(dto);

    return this.persistence.runWithEvents(async (tx, events) => {
      const conversation = await this.getDirectConversationForRead(tx, user.userId, conversationId);
      const existing = input.clientMessageId
        ? await this.messagesRepo.findExistingDirectMessage(
            tx,
            user.userId,
            conversationId,
            input.clientMessageId,
          )
        : null;

      if (existing) {
        return this.hydrateMessage(tx, existing);
      }

      await this.assertReadyMessageAttachments(tx, user.userId, input.attachmentIds);
      const mentionUserIds = filterDirectMentionUsers(input.mentionUserIds, conversation);
      const recipientId =
        conversation.participantAId === user.userId
          ? conversation.participantBId
          : conversation.participantAId;
      const message = await this.messagesRepo.insertMessage(tx, {
        channelId: null,
        clientMessageId: input.clientMessageId,
        content: input.content,
        conversationId,
        scopeType: 'dm',
        senderId: user.userId,
      });
      await this.messagesRepo.insertMessageAttachments(tx, message.id, input.attachmentIds);
      await this.messagesRepo.insertMessageMentions(tx, message.id, mentionUserIds);
      await this.messagesRepo.updateDirectConversationLastMessage(tx, conversationId, message.id);
      await this.messagesRepo.markSenderReadDirect(tx, user.userId, conversationId, message.id);
      const unreadRows = [
        await this.messagesRepo.incrementDirectUnread(tx, conversationId, recipientId),
      ];
      const summary = await this.hydrateMessage(tx, message);
      const room = buildRealtimeRoom('dm', conversationId);

      events.publish(room, RealtimeEvent.MessageCreated, summary, requestId);
      this.enqueueUnreadEvents(
        events,
        unreadRows,
        { channelId: null, conversationId, scopeType: 'dm' },
        requestId,
      );

      const notifResult = await this.notificationsService.createNotification(tx, {
        contentPreview: `${message.senderNickname}: ${previewContent(input.content)}`,
        dedupeKey: `message:${message.id}:dm:${recipientId}`,
        sourceId: message.id,
        sourceType: 'message',
        type: 'direct_message',
        userId: recipientId,
      });
      if (notifResult.created) {
        this.notificationsService.publishCreated(events, notifResult.notification, requestId);
      }

      return summary;
    });
  }

  async loadChannelMessages(
    user: AuthenticatedUserContext,
    channelId: string,
    dto: LoadMessagesDto,
  ): Promise<MessageListResponse> {
    await this.getChannelForRead(user, channelId);
    const limit = pageLimit(dto);
    const cursor = decodeCursor(dto.cursor);
    const rows = await this.messagesRepo.loadChannelMessages(
      channelId,
      { createdAt: cursor?.created_at ?? null, id: cursor?.id ?? null },
      limit + 1,
    );
    const page = rows.slice(0, limit);
    const readState = await this.messagesRepo.ensureChannelReadState(user.userId, channelId);

    return {
      items: await Promise.all(page.map((row) => this.hydrateMessage(this.prisma, row))),
      next_cursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
      read_state: toReadStateSummary(readState),
    };
  }

  async loadDirectMessages(
    user: AuthenticatedUserContext,
    conversationId: string,
    dto: LoadMessagesDto,
  ): Promise<MessageListResponse> {
    await this.getDirectConversationForRead(this.prisma, user.userId, conversationId);
    const limit = pageLimit(dto);
    const cursor = decodeCursor(dto.cursor);
    const rows = await this.messagesRepo.loadDirectMessages(
      conversationId,
      { createdAt: cursor?.created_at ?? null, id: cursor?.id ?? null },
      limit + 1,
    );
    const page = rows.slice(0, limit);
    const readState = await this.messagesRepo.ensureDirectReadState(user.userId, conversationId);

    return {
      items: await Promise.all(page.map((row) => this.hydrateMessage(this.prisma, row))),
      next_cursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
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

      await this.getChannelForRead(user, dto.channel_id);
      const channelId = dto.channel_id;

      return this.persistence.runWithEvents(async (_tx, events) => {
        const readState = await this.markScopeRead(
          user.userId,
          'channel',
          channelId,
          null,
          dto.last_read_message_id,
        );
        this.enqueueUnreadEvents(
          events,
          [
            {
              lastReadMessageId: readState.lastReadMessageId,
              unreadCount: readState.unreadCount,
              userId: user.userId,
            },
          ],
          { channelId, conversationId: null, scopeType: 'channel' },
          requestId,
        );

        return toReadStateSummary(readState);
      });
    }

    if (!dto.conversation_id) {
      throw new AppError(ErrorCode.ValidationFailed, 'conversation_id is required.', HttpStatus.BAD_REQUEST);
    }

    await this.getDirectConversationForRead(this.prisma, user.userId, dto.conversation_id);
    const conversationId = dto.conversation_id;

    return this.persistence.runWithEvents(async (_tx, events) => {
      const readState = await this.markScopeRead(
        user.userId,
        'dm',
        null,
        conversationId,
        dto.last_read_message_id,
      );
      this.enqueueUnreadEvents(
        events,
        [
          {
            lastReadMessageId: readState.lastReadMessageId,
            unreadCount: readState.unreadCount,
            userId: user.userId,
          },
        ],
        { channelId: null, conversationId, scopeType: 'dm' },
        requestId,
      );

      return toReadStateSummary(readState);
    });
  }

  async deleteMessage(
    user: AuthenticatedUserContext,
    messageId: string,
    dto: DeleteMessageDto,
    requestId?: string,
  ): Promise<MessageSummary> {
    const message = await this.messagesRepo.findVisibleMessageWithDeletion(messageId);

    if (!message) {
      throw new AppError(ErrorCode.ResourceNotFound, 'Message was not found.', HttpStatus.NOT_FOUND);
    }

    if (dto.operation === 'retract') {
      if (message.senderId !== user.userId) {
        throw new AppError(ErrorCode.PermissionDenied, 'Permission denied.', HttpStatus.FORBIDDEN);
      }
    } else {
      if (message.scopeType !== 'channel' || !message.channelId) {
        throw new AppError(
          ErrorCode.PermissionDenied,
          'Direct message history cannot be deleted by another user.',
          HttpStatus.FORBIDDEN,
        );
      }

      await this.permissionsService.assertAllowed({
        action: PermissionAction.ManageMessage,
        requestId,
        resource: { id: message.channelId, type: 'channel' },
        user,
      });
    }

    const visibility = dto.operation === 'retract' ? 'retracted' : 'deleted';

    return this.persistence.runWithEvents(async (tx, events) => {
      const updated = await this.messagesRepo.markMessageDeleted(tx, messageId, visibility);

      if (!updated) {
        throw new AppError(ErrorCode.ResourceNotFound, 'Message was not found.', HttpStatus.NOT_FOUND);
      }

      const unreadRows = updated.scopeType === 'channel' && updated.channelId
        ? await this.messagesRepo.recomputeChannelUnreadAfterDelete(tx, updated.channelId)
        : updated.conversationId
          ? await this.messagesRepo.recomputeDirectUnreadAfterDelete(tx, updated.conversationId)
          : [];
      const summary = await this.hydrateMessage(tx, updated);
      const room =
        summary.scope_type === 'channel'
          ? buildRealtimeRoom('channel', summary.channel_id!)
          : buildRealtimeRoom('dm', summary.conversation_id!);

      events.audit({
        action: `DeleteMessage:${dto.operation}`,
        actorId: user.userId,
        metadata: { reason: normalizeNullableString(dto.reason) },
        requestId,
        result: 'success',
        targetId: messageId,
        targetType: 'message',
      });
      events.publish(
        room,
        RealtimeEvent.MessageDeleted,
        {
          deleted_at: new Date().toISOString(),
          message_id: messageId,
          operation: dto.operation,
        },
        requestId,
      );
      this.enqueueUnreadEvents(
        events,
        unreadRows,
        {
          channelId: summary.channel_id,
          conversationId: summary.conversation_id,
          scopeType: summary.scope_type as 'channel' | 'dm',
        },
        requestId,
      );

      if (dto.operation === 'delete' && message.senderId !== user.userId) {
        const notifResult = await this.notificationsService.createNotification(tx, {
          contentPreview: 'Your message was deleted by a moderator',
          dedupeKey: `message:${messageId}:deleted`,
          sourceId: messageId,
          sourceType: 'message',
          type: 'PERMISSION_CHANGED',
          userId: message.senderId,
        });
        if (notifResult.created) {
          this.notificationsService.publishCreated(events, notifResult.notification, requestId);
        }
      }

      return summary;
    });
  }

  private async getChannelForSend(
    user: AuthenticatedUserContext,
    channelId: string,
    requestId?: string,
  ): Promise<ChannelAccessRow> {
    await this.permissionsService.assertAllowed({
      action: PermissionAction.SendMessage,
      requestId,
      resource: { id: channelId, type: 'channel' },
      user,
    });
    const channel = await this.messagesRepo.findActiveTextChannel(channelId);

    if (!channel) {
      throw new AppError(ErrorCode.PermissionDenied, 'Permission denied.', HttpStatus.FORBIDDEN);
    }

    return channel;
  }

  private async getChannelForRead(
    user: AuthenticatedUserContext,
    channelId: string,
  ): Promise<ChannelAccessRow> {
    await this.permissionsService.assertAllowed({
      action: PermissionAction.ViewChannel,
      resource: { id: channelId, type: 'channel' },
      user,
    });
    const channel = await this.messagesRepo.findActiveTextChannel(channelId);

    if (!channel) {
      throw new AppError(ErrorCode.PermissionDenied, 'Permission denied.', HttpStatus.FORBIDDEN);
    }

    return channel;
  }

  private async getDirectConversationForRead(
    executor: RawSqlExecutor,
    userId: string,
    conversationId: string,
  ): Promise<DirectConversationAccessRow> {
    const conversation = await this.messagesRepo.findDirectConversationForUser(
      executor,
      userId,
      conversationId,
    );

    if (!conversation) {
      throw new AppError(ErrorCode.PermissionDenied, 'Permission denied.', HttpStatus.FORBIDDEN);
    }

    return conversation;
  }

  private async assertReadyMessageAttachments(
    executor: RawSqlExecutor,
    userId: string,
    attachmentIds: string[],
  ): Promise<void> {
    for (const attachmentId of attachmentIds) {
      const attachment = await this.messagesRepo.findReadyMessageAttachment(
        executor,
        attachmentId,
        userId,
      );

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
    executor: RawSqlExecutor,
    serverId: string,
    mentionUserIds: string[],
    readableUserIds: string[],
  ): Promise<string[]> {
    const validUserIds: string[] = [];
    const readableUsers = new Set(readableUserIds);

    for (const userId of mentionUserIds) {
      const member = await this.messagesRepo.findServerMembership(executor, serverId, userId);

      if (!member) {
        throw new AppError(
          ErrorCode.ResourceNotFound,
          'Mentioned user is not a member of this server.',
          HttpStatus.NOT_FOUND,
        );
      }

      if (!readableUsers.has(member.userId)) {
        throw new AppError(
          ErrorCode.PermissionDenied,
          'Mentioned user cannot access this channel.',
          HttpStatus.FORBIDDEN,
        );
      }

      validUserIds.push(member.userId);
    }

    return validUserIds;
  }

  private async hydrateMessage(
    executor: RawSqlExecutor,
    row: MessageRow,
  ): Promise<MessageSummary> {
    const [attachments, mentions] = await Promise.all([
      this.messagesRepo.loadMessageAttachments(executor, row.id),
      this.messagesRepo.loadMessageMentions(executor, row.id),
    ]);

    return toMessageSummary(row, attachments, mentions);
  }

  private async markScopeRead(
    userId: string,
    scopeType: 'channel' | 'dm',
    channelId: string | null,
    conversationId: string | null,
    lastReadMessageId: string,
  ): Promise<ReadStateRow> {
    const target = await this.messagesRepo.findMessageInScope(
      scopeType,
      channelId,
      conversationId,
      lastReadMessageId,
    );

    if (!target) {
      throw new AppError(
        ErrorCode.ResourceNotFound,
        'Read target message was not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const current = await this.messagesRepo.findCurrentReadState(
      userId,
      scopeType,
      channelId,
      conversationId,
    );

    if (current?.lastReadCreatedAt && current.lastReadCreatedAt > target.createdAt) {
      throw new AppError(
        ErrorCode.Conflict,
        'Read state cannot move backwards.',
        HttpStatus.CONFLICT,
      );
    }

    if (scopeType === 'channel') {
      return this.messagesRepo.upsertChannelReadStateAtMessage(
        userId,
        channelId!,
        lastReadMessageId,
        target.createdAt,
      );
    }

    return this.messagesRepo.upsertDirectReadStateAtMessage(
      userId,
      conversationId!,
      lastReadMessageId,
      target.createdAt,
    );
  }

  private enqueueUnreadEvents(
    events: EventCollector,
    rows: UnreadRow[],
    scope: UnreadScope,
    requestId?: string,
  ): void {
    for (const row of rows) {
      events.publish(
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
