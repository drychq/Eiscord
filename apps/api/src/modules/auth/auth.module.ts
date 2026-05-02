import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AccessTokenGuard } from '../../common/auth/access-token.guard';
import { RejectingTokenVerifier } from '../../common/auth/rejecting-token.verifier';
import { TOKEN_VERIFIER } from '../../common/auth/auth.types';

@Module({
  providers: [
    {
      provide: TOKEN_VERIFIER,
      useClass: RejectingTokenVerifier,
    },
    AccessTokenGuard,
    {
      provide: APP_GUARD,
      useExisting: AccessTokenGuard,
    },
  ],
  exports: [AccessTokenGuard, TOKEN_VERIFIER],
})
export class AuthModule {}
