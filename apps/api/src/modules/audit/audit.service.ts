import { randomUUID } from 'node:crypto';

import { Injectable, Logger, Optional } from '@nestjs/common';

import { PrismaService } from '../../common/persistence/prisma.service';

export type AuditResult = 'failure' | 'success';

export type AuditRecord = {
  action: string;
  actorId?: string;
  failureReason?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
  result: AuditResult;
  targetId?: string;
  targetType?: string;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async record(record: AuditRecord): Promise<void> {
    const payload = {
      action: record.action,
      actor_id: record.actorId,
      failure_reason: record.failureReason,
      metadata: sanitizeMetadata(record.metadata),
      request_id: record.requestId,
      result: record.result,
      target_id: record.targetId,
      target_type: record.targetType,
    };

    if (this.prisma) {
      await this.prisma.$executeRaw`
        INSERT INTO audit_logs (
          id,
          actor_id,
          target_type,
          target_id,
          action,
          result,
          failure_reason,
          request_id,
          metadata
        )
        VALUES (
          ${randomUUID()}::uuid,
          ${record.actorId ?? null}::uuid,
          ${record.targetType ?? null},
          ${record.targetId ?? null},
          ${record.action},
          ${record.result},
          ${record.failureReason ?? null},
          ${record.requestId ?? null},
          ${payload.metadata ? JSON.stringify(payload.metadata) : null}::jsonb
        )
      `;

      return;
    }

    if (record.result === 'failure') {
      this.logger.warn(JSON.stringify(payload));
      return;
    }

    this.logger.log(JSON.stringify(payload));
  }
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      isSensitiveKey(key) ? '[redacted]' : value,
    ]),
  );
}

function isSensitiveKey(key: string): boolean {
  return /(password|token|secret|credential|code)/i.test(key);
}
