import { PrismaService } from '../../infra/persistence/prisma.service';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('writes sanitized audit records through Prisma', async () => {
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const service = new AuditService(prisma as unknown as PrismaService);

    await service.record({
      action: 'LoginUser',
      actorId: '00000000-0000-4000-8000-000000000001',
      metadata: {
        password: 'plain-text',
        safe: 'value',
      },
      requestId: 'request-1',
      result: 'failure',
      targetId: '00000000-0000-4000-8000-000000000001',
      targetType: 'user',
    });

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(prisma.$executeRaw.mock.calls[0])).not.toContain('plain-text');
    expect(JSON.stringify(prisma.$executeRaw.mock.calls[0])).toContain('[redacted]');
  });
});
