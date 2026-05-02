import { Injectable } from '@nestjs/common';

import { AuthenticatedUserContext, TokenVerifier } from './auth.types';

@Injectable()
export class RejectingTokenVerifier implements TokenVerifier {
  verifyAccessToken(token: string): Promise<AuthenticatedUserContext | null> {
    void token;

    return Promise.resolve(null);
  }
}
