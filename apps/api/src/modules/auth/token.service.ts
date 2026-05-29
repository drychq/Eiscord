import { createHash, createHmac, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthenticatedUserContext } from '../../core/auth/auth.types';

type AccessTokenClaims = {
  exp: number;
  iat: number;
  sid: string;
  status: AuthenticatedUserContext['accountStatus'];
  sub: string;
  typ: 'access';
};

type CreateAccessTokenInput = {
  accountStatus: AuthenticatedUserContext['accountStatus'];
  sessionId: string;
  userId: string;
};

@Injectable()
export class TokenService {
  constructor(private readonly config: ConfigService) {}

  createAccessToken(input: CreateAccessTokenInput): string {
    const now = Math.floor(Date.now() / 1000);
    const claims: AccessTokenClaims = {
      exp: now + this.getAccessTtlSeconds(),
      iat: now,
      sid: input.sessionId,
      status: input.accountStatus,
      sub: input.userId,
      typ: 'access',
    };

    return this.signJwt(claims);
  }

  verifyAccessToken(token: string): AuthenticatedUserContext | null {
    const claims = this.verifyJwt(token);

    if (!claims || claims.typ !== 'access' || claims.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    if (!isAccountStatus(claims.status)) {
      return null;
    }

    return {
      accountStatus: claims.status,
      sessionId: claims.sid,
      userId: claims.sub,
    };
  }

  createRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  getRefreshExpiresAt(): Date {
    return new Date(Date.now() + this.getRefreshTtlSeconds() * 1000);
  }

  private signJwt(claims: AccessTokenClaims): string {
    const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
    const payload = base64UrlJson(claims);
    const signingInput = `${header}.${payload}`;
    const signature = this.sign(signingInput);

    return `${signingInput}.${signature}`;
  }

  private verifyJwt(token: string): AccessTokenClaims | null {
    const [header, payload, signature] = token.split('.');

    if (!header || !payload || !signature) {
      return null;
    }

    const signingInput = `${header}.${payload}`;

    if (this.sign(signingInput) !== signature) {
      return null;
    }

    try {
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Partial<AccessTokenClaims>;

      if (
        typeof parsed.exp !== 'number' ||
        typeof parsed.iat !== 'number' ||
        typeof parsed.sid !== 'string' ||
        typeof parsed.status !== 'string' ||
        typeof parsed.sub !== 'string' ||
        parsed.typ !== 'access'
      ) {
        return null;
      }

      return parsed as AccessTokenClaims;
    } catch {
      return null;
    }
  }

  private sign(signingInput: string): string {
    return createHmac('sha256', this.getAccessSecret()).update(signingInput).digest('base64url');
  }

  private getAccessSecret(): string {
    return this.config.get<string>('JWT_ACCESS_SECRET') ?? 'change-me-access';
  }

  private getAccessTtlSeconds(): number {
    return this.config.get<number>('JWT_ACCESS_TTL_SECONDS') ?? 900;
  }

  private getRefreshTtlSeconds(): number {
    return this.config.get<number>('JWT_REFRESH_TTL_SECONDS') ?? 2_592_000;
  }
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function isAccountStatus(value: string): value is AuthenticatedUserContext['accountStatus'] {
  return value === 'active' || value === 'pending_verification' || value === 'disabled';
}
