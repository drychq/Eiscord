import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

import { ErrorCode } from '@eiscord/shared';

import { AppError } from '../../common/errors/app-error';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { PrismaService } from '../../common/persistence/prisma.service';
import { AttachmentsService } from './attachments.service';

const now = new Date('2026-05-03T00:00:00.000Z');
const user = { accountStatus: 'active', sessionId: sessionId(), userId: userId() };

describe('AttachmentsService', () => {
  let prisma: { $queryRaw: jest.Mock };
  let permissionsService: jest.Mocked<PermissionsService>;
  let service: AttachmentsService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
    };
    permissionsService = {
      assertAllowed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PermissionsService>;
    service = new AttachmentsService(
      {
        get: jest.fn((key: string) => {
          if (key === 'UPLOAD_MAX_BYTES') {
            return 1024;
          }

          if (key === 'S3_BUCKET') {
            return 'eiscord-local';
          }

          if (key === 'S3_ENDPOINT') {
            return 'http://localhost:9000';
          }

          return 'minioadmin';
        }),
      } as unknown as ConfigService,
      permissionsService,
      prisma as unknown as PrismaService,
    );
    jest.clearAllMocks();
  });

  it('initializes pending attachments and returns a presigned PUT URL', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([attachmentRow({ status: 'pending' })]);

    const result = await service.initAttachment(user, {
      file_name: 'image.png',
      mime_type: 'image/png',
      purpose: 'message',
      size_bytes: 128,
    });

    expect(result).toMatchObject({
      attachment: { attachment_id: attachmentId(), status: 'pending' },
      upload: { method: 'PUT' },
    });
    expect(result.upload.url).toContain('X-Amz-Signature=');
  });

  it('rejects files larger than the configured upload limit', async () => {
    await expect(
      service.initAttachment(user, {
        file_name: 'large.bin',
        mime_type: 'application/octet-stream',
        purpose: 'message',
        size_bytes: 2048,
      }),
    ).rejects.toMatchObject<AppError>({ code: ErrorCode.PayloadTooLarge });

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('completes uploads after object metadata matches attachment metadata', async () => {
    const sendSpy = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValueOnce({ ContentLength: 128, ContentType: 'image/png' } as never);
    prisma.$queryRaw.mockResolvedValueOnce([attachmentRow({ status: 'pending' })]);
    prisma.$queryRaw.mockResolvedValueOnce([attachmentRow({ status: 'ready' })]);

    await expect(service.completeAttachment(user, attachmentId())).resolves.toMatchObject({
      attachment_id: attachmentId(),
      status: 'ready',
    });
    expect(sendSpy).toHaveBeenCalled();
    sendSpy.mockRestore();
  });
});

function userId(): string {
  return '00000000-0000-4000-8000-000000000001';
}

function sessionId(): string {
  return '00000000-0000-4000-8000-000000000101';
}

function attachmentId(): string {
  return '00000000-0000-4000-8000-000000000201';
}

function attachmentRow(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: now,
    fileName: 'image.png',
    id: attachmentId(),
    mimeType: 'image/png',
    ownerId: userId(),
    purpose: 'message',
    sizeBytes: 128,
    status: 'ready',
    storageKey: 'message/user/image.png',
    ...overrides,
  };
}
