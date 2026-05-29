import { Injectable } from '@nestjs/common';

import { AuthenticatedUserContext, TokenVerifier } from '../../core/auth/auth.types';
import { PrismaService } from '../../infra/persistence/prisma.service';
import { TokenService } from './token.service';

type SessionUserStatusRow = {
  accountStatus: string;
  expiresAt: Date;
  revokedAt: Date | null;
  sessionId: string;
  userId: string;
};

@Injectable()
export class PrismaTokenVerifier implements TokenVerifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async verifyAccessToken(token: string): Promise<AuthenticatedUserContext | null> {
    const tokenUser = this.tokenService.verifyAccessToken(token);

    if (!tokenUser) {
      return null;
    }

    const [session] = await this.prisma.$queryRaw<SessionUserStatusRow[]>`
      SELECT
        s.id AS "sessionId",
        s.user_id AS "userId",
        s.expires_at AS "expiresAt",
        s.revoked_at AS "revokedAt",
        u.account_status AS "accountStatus"
      FROM auth_sessions s
      INNER JOIN users u ON u.id = s.user_id
      WHERE s.id = ${tokenUser.sessionId}::uuid
      LIMIT 1
    `;

    if (
      !session ||
      session.userId !== tokenUser.userId ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      return null;
    }

    const accountStatus = toAccountStatus(session.accountStatus);

    if (!accountStatus || accountStatus === 'disabled') {
      return null;
    }

    return {
      accountStatus,
      sessionId: session.sessionId,
      userId: session.userId,
    };
  }
}

function toAccountStatus(value: string): AuthenticatedUserContext['accountStatus'] | null {
  if (value === 'active' || value === 'pending_verification' || value === 'disabled') {
    return value;
  }

  return null;
}
