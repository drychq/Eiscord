import type { PrismaService } from './prisma.service';

/**
 * Prisma client subset that supports raw SQL execution and queries.
 * Used by repositories that accept either a regular PrismaService or
 * a transaction client without leaking the full Prisma surface.
 */
export type RawSqlExecutor = Pick<PrismaService, '$executeRaw' | '$queryRaw'>;
