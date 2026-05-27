import { HttpStatus, Injectable } from '@nestjs/common';

import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import type { RawSqlExecutor } from '../../common/persistence/types';
import { buildUserRoom } from '../realtime/realtime.rooms';
import { RealtimePublisher } from '../realtime/realtime.publisher';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { MarkNotificationsReadDto } from './dto/mark-notifications-read.dto';
import {
  NotificationListResponse,
  NotificationRow,
  toNotificationSummary,
} from './notifications.presenter';

export type CreateNotificationInput = {
  contentPreview: string;
  dedupeKey: string;
  sourceId: string;
  sourceType: string;
  type: string;
  userId: string;
};

export type CreateNotificationResult = {
  created: boolean;
  notification: NotificationRow;
};

type NotificationCursor = {
  created_at: string;
  id: string;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimePublisher: RealtimePublisher,
  ) {}

  async createNotification(
    tx: RawSqlExecutor,
    input: CreateNotificationInput,
  ): Promise<CreateNotificationResult> {
    const [created] = await tx.$queryRaw<NotificationRow[]>`
      INSERT INTO notifications (
        user_id,
        type,
        source_type,
        source_id,
        content_preview,
        dedupe_key
      )
      VALUES (
        ${input.userId}::uuid,
        ${input.type},
        ${input.sourceType},
        ${input.sourceId}::uuid,
        ${input.contentPreview.slice(0, 280)},
        ${input.dedupeKey}
      )
      ON CONFLICT (dedupe_key) DO NOTHING
      RETURNING
        id,
        user_id AS "userId",
        type,
        source_type AS "sourceType",
        source_id AS "sourceId",
        content_preview AS "contentPreview",
        is_read AS "isRead",
        dedupe_key AS "dedupeKey",
        created_at AS "createdAt",
        read_at AS "readAt"
    `;

    if (created) {
      return { created: true, notification: created };
    }

    const [existing] = await tx.$queryRaw<NotificationRow[]>`
      SELECT
        id,
        user_id AS "userId",
        type,
        source_type AS "sourceType",
        source_id AS "sourceId",
        content_preview AS "contentPreview",
        is_read AS "isRead",
        dedupe_key AS "dedupeKey",
        created_at AS "createdAt",
        read_at AS "readAt"
      FROM notifications
      WHERE dedupe_key = ${input.dedupeKey}
      LIMIT 1
    `;

    return { created: false, notification: existing };
  }

  publishCreated(row: NotificationRow, requestId?: string) {
    this.realtimePublisher.publishToRoom(
      buildUserRoom(row.userId),
      RealtimeEvent.NotificationCreated,
      toNotificationSummary(row),
      requestId,
    );
  }

  async listNotifications(
    user: AuthenticatedUserContext,
    dto: ListNotificationsDto,
  ): Promise<NotificationListResponse> {
    const limit = Math.min(Math.max(dto.limit ?? 50, 1), 100);
    const isRead = parseOptionalBoolean(dto.is_read);
    const cursor = decodeCursor(dto.cursor);
    const cursorCreatedAt = cursor?.created_at ?? null;
    const cursorId = cursor?.id ?? null;
    const rows = await this.prisma.$queryRaw<NotificationRow[]>`
      SELECT
        id,
        user_id AS "userId",
        type,
        source_type AS "sourceType",
        source_id AS "sourceId",
        content_preview AS "contentPreview",
        is_read AS "isRead",
        dedupe_key AS "dedupeKey",
        created_at AS "createdAt",
        read_at AS "readAt"
      FROM notifications
      WHERE user_id = ${user.userId}::uuid
        AND (${isRead}::boolean IS NULL OR is_read = ${isRead}::boolean)
        AND (
          ${cursorCreatedAt}::timestamptz IS NULL
          OR created_at < ${cursorCreatedAt}::timestamptz
          OR (created_at = ${cursorCreatedAt}::timestamptz AND id::text < ${cursorId})
        )
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit + 1}
    `;
    const page = rows.slice(0, limit);
    const next = rows.length > limit ? page[page.length - 1] : null;

    return {
      items: page.map(toNotificationSummary),
      next_cursor: next ? encodeCursor(next.createdAt, next.id) : null,
    };
  }

  async markRead(
    user: AuthenticatedUserContext,
    dto: MarkNotificationsReadDto,
  ): Promise<{ updated_count: number }> {
    if (!dto.mark_all && (!dto.notification_ids || dto.notification_ids.length === 0)) {
      throw new AppError(
        ErrorCode.ValidationFailed,
        'Provide notification_ids or mark_all.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.mark_all) {
      const updated = await this.prisma.$executeRaw`
        UPDATE notifications
        SET is_read = true, read_at = COALESCE(read_at, NOW())
        WHERE user_id = ${user.userId}::uuid
          AND is_read = false
      `;

      return { updated_count: Number(updated) };
    }

    const updated = await this.prisma.$executeRaw`
      UPDATE notifications
      SET is_read = true, read_at = COALESCE(read_at, NOW())
      WHERE user_id = ${user.userId}::uuid
        AND id = ANY(${dto.notification_ids ?? []}::uuid[])
        AND is_read = false
    `;

    return { updated_count: Number(updated) };
  }
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({
      created_at: createdAt.toISOString(),
      id,
    } satisfies NotificationCursor),
  ).toString('base64url');
}

function decodeCursor(cursor: string | undefined): NotificationCursor | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<NotificationCursor>;

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

function parseOptionalBoolean(value: string | undefined): boolean | null {
  if (value === undefined) {
    return null;
  }

  return value === 'true';
}
