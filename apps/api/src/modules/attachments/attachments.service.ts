import { randomUUID } from 'node:crypto';

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ErrorCode } from '@eiscord/shared';

import { AuthenticatedUserContext } from '../../common/auth/auth.types';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../common/persistence/prisma.service';
import { PermissionAction } from '../../common/permissions/permission.types';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { AttachmentAccessResponse, AttachmentInitResponse, AttachmentRow, toAttachmentSummary } from './attachments.presenter';
import { InitAttachmentDto } from './dto/init-attachment.dto';

type MessageAttachmentContextRow = {
  channelId: string | null;
  conversationId: string | null;
  scopeType: string;
  visibility: string;
};

const PRESIGNED_URL_TTL_SECONDS = 900;

@Injectable()
export class AttachmentsService {
  private readonly bucket: string;
  private readonly maxBytes: number;
  private readonly s3Client: S3Client;

  constructor(
    config: ConfigService,
    private readonly permissionsService: PermissionsService,
    private readonly prisma: PrismaService,
  ) {
    this.bucket = config.get<string>('S3_BUCKET') ?? 'eiscord-local';
    this.maxBytes = config.get<number>('UPLOAD_MAX_BYTES') ?? 10_485_760;
    this.s3Client = new S3Client({
      credentials: {
        accessKeyId: config.get<string>('S3_ACCESS_KEY') ?? 'minioadmin',
        secretAccessKey: config.get<string>('S3_SECRET_KEY') ?? 'minioadmin',
      },
      endpoint: config.get<string>('S3_ENDPOINT') ?? 'http://localhost:9000',
      forcePathStyle: true,
      region: 'us-east-1',
    });
  }

  async initAttachment(
    user: AuthenticatedUserContext,
    dto: InitAttachmentDto,
  ): Promise<AttachmentInitResponse> {
    if (dto.size_bytes > this.maxBytes) {
      throw new AppError(
        ErrorCode.PayloadTooLarge,
        'Attachment exceeds the configured upload size limit.',
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const storageKey = createStorageKey(user.userId, dto.purpose, dto.file_name);
    const [attachment] = await this.prisma.$queryRaw<AttachmentRow[]>`
      INSERT INTO attachments (id, owner_id, storage_key, file_name, mime_type, size_bytes, purpose, status)
      VALUES (
        ${randomUUID()}::uuid,
        ${user.userId}::uuid,
        ${storageKey},
        ${dto.file_name},
        ${dto.mime_type},
        ${dto.size_bytes},
        ${dto.purpose},
        'pending'
      )
      RETURNING
        id,
        owner_id AS "ownerId",
        storage_key AS "storageKey",
        file_name AS "fileName",
        mime_type AS "mimeType",
        size_bytes AS "sizeBytes",
        purpose,
        status,
        created_at AS "createdAt"
    `;
    const uploadUrl = await this.createPutUrl(attachment);

    return {
      attachment: toAttachmentSummary(attachment),
      upload: {
        expires_in: PRESIGNED_URL_TTL_SECONDS,
        method: 'PUT',
        url: uploadUrl,
      },
    };
  }

  async completeAttachment(
    user: AuthenticatedUserContext,
    attachmentId: string,
  ): Promise<ReturnType<typeof toAttachmentSummary>> {
    const attachment = await this.getOwnedAttachment(user.userId, attachmentId);

    if (attachment.status === 'ready') {
      return toAttachmentSummary(attachment);
    }

    const metadata = await this.headObject(attachment);

    if (metadata.ContentLength !== undefined && metadata.ContentLength !== attachment.sizeBytes) {
      throw new AppError(
        ErrorCode.Conflict,
        'Uploaded object size does not match attachment metadata.',
        HttpStatus.CONFLICT,
      );
    }

    if (metadata.ContentType && metadata.ContentType !== attachment.mimeType) {
      throw new AppError(
        ErrorCode.Conflict,
        'Uploaded object content type does not match attachment metadata.',
        HttpStatus.CONFLICT,
      );
    }

    const [updated] = await this.prisma.$queryRaw<AttachmentRow[]>`
      UPDATE attachments
      SET status = 'ready'
      WHERE id = ${attachmentId}::uuid
        AND owner_id = ${user.userId}::uuid
      RETURNING
        id,
        owner_id AS "ownerId",
        storage_key AS "storageKey",
        file_name AS "fileName",
        mime_type AS "mimeType",
        size_bytes AS "sizeBytes",
        purpose,
        status,
        created_at AS "createdAt"
    `;

    return toAttachmentSummary(updated);
  }

  async getAttachmentAccess(
    user: AuthenticatedUserContext,
    attachmentId: string,
    requestId?: string,
  ): Promise<AttachmentAccessResponse> {
    const attachment = await this.getReadyAttachment(attachmentId);
    const messageContext = await this.getMessageAttachmentContext(attachmentId);

    if (messageContext) {
      if (messageContext.visibility !== 'visible') {
        throw new AppError(ErrorCode.ResourceNotFound, 'Attachment was not found.', HttpStatus.NOT_FOUND);
      }

      if (messageContext.scopeType === 'dm') {
        await this.permissionsService.assertAllowed({
          action: PermissionAction.AccessAttachment,
          requestId,
          resource: { id: messageContext.conversationId!, type: 'dm' },
          user,
        });
      } else {
        await this.permissionsService.assertAllowed({
          action: PermissionAction.AccessAttachment,
          requestId,
          resource: { id: messageContext.channelId!, type: 'channel' },
          user,
        });
      }
    } else if (attachment.ownerId !== user.userId) {
      throw new AppError(ErrorCode.PermissionDenied, 'Permission denied.', HttpStatus.FORBIDDEN);
    }

    const downloadUrl = await this.createGetUrl(attachment);

    return {
      attachment: toAttachmentSummary(attachment),
      download: {
        expires_in: PRESIGNED_URL_TTL_SECONDS,
        method: 'GET',
        url: downloadUrl,
      },
    };
  }

  private async getOwnedAttachment(userId: string, attachmentId: string): Promise<AttachmentRow> {
    const [attachment] = await this.prisma.$queryRaw<AttachmentRow[]>`
      SELECT
        id,
        owner_id AS "ownerId",
        storage_key AS "storageKey",
        file_name AS "fileName",
        mime_type AS "mimeType",
        size_bytes AS "sizeBytes",
        purpose,
        status,
        created_at AS "createdAt"
      FROM attachments
      WHERE id = ${attachmentId}::uuid
        AND owner_id = ${userId}::uuid
        AND status IN ('pending', 'ready')
      LIMIT 1
    `;

    if (!attachment) {
      throw new AppError(ErrorCode.ResourceNotFound, 'Attachment was not found.', HttpStatus.NOT_FOUND);
    }

    return attachment;
  }

  private async getReadyAttachment(attachmentId: string): Promise<AttachmentRow> {
    const [attachment] = await this.prisma.$queryRaw<AttachmentRow[]>`
      SELECT
        id,
        owner_id AS "ownerId",
        storage_key AS "storageKey",
        file_name AS "fileName",
        mime_type AS "mimeType",
        size_bytes AS "sizeBytes",
        purpose,
        status,
        created_at AS "createdAt"
      FROM attachments
      WHERE id = ${attachmentId}::uuid
        AND status = 'ready'
      LIMIT 1
    `;

    if (!attachment) {
      throw new AppError(ErrorCode.ResourceNotFound, 'Attachment was not found.', HttpStatus.NOT_FOUND);
    }

    return attachment;
  }

  private async getMessageAttachmentContext(
    attachmentId: string,
  ): Promise<MessageAttachmentContextRow | null> {
    const [row] = await this.prisma.$queryRaw<MessageAttachmentContextRow[]>`
      SELECT
        msg.scope_type AS "scopeType",
        msg.channel_id AS "channelId",
        msg.conversation_id AS "conversationId",
        msg.visibility
      FROM message_attachments ma
      INNER JOIN messages msg ON msg.id = ma.message_id
      WHERE ma.attachment_id = ${attachmentId}::uuid
      LIMIT 1
    `;

    return row ?? null;
  }

  private async createPutUrl(attachment: AttachmentRow): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      ContentType: attachment.mimeType,
      Key: attachment.storageKey,
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: PRESIGNED_URL_TTL_SECONDS,
      signableHeaders: new Set(['content-type']),
    });
  }

  private async createGetUrl(attachment: AttachmentRow): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: attachment.storageKey,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn: PRESIGNED_URL_TTL_SECONDS });
  }

  private async headObject(attachment: AttachmentRow) {
    try {
      return await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: attachment.storageKey,
        }),
      );
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new AppError(
          ErrorCode.Conflict,
          'Uploaded object was not found.',
          HttpStatus.CONFLICT,
        );
      }

      throw new AppError(
        ErrorCode.DependencyUnavailable,
        'Attachment object storage is unavailable.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}

function createStorageKey(userId: string, purpose: string, fileName: string): string {
  const safeName = fileName.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'file';

  return `${purpose}/${userId}/${randomUUID()}-${safeName}`;
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('$metadata' in error
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
      : false)
  );
}
