import { Injectable, Logger } from '@nestjs/common';

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

  async record(record: AuditRecord): Promise<void> {
    const payload = {
      action: record.action,
      actor_id: record.actorId,
      failure_reason: record.failureReason,
      metadata: record.metadata,
      request_id: record.requestId,
      result: record.result,
      target_id: record.targetId,
      target_type: record.targetType,
    };

    const serialized = JSON.stringify(payload);

    if (record.result === 'failure') {
      this.logger.warn(serialized);
      return;
    }

    this.logger.log(serialized);
  }
}
