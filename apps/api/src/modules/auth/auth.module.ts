import { Module } from '@nestjs/common';

import { AccessTokenGuard } from '../../common/auth/access-token.guard';
import { TOKEN_VERIFIER } from '../../common/auth/auth.types';
import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { PrismaTokenVerifier } from './prisma-token.verifier';
import { TokenService } from './token.service';

@Module({
  imports: [AuditModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    PrismaTokenVerifier,
    TokenService,
    {
      provide: TOKEN_VERIFIER,
      useExisting: PrismaTokenVerifier,
    },
    AccessTokenGuard,
  ],
  exports: [AccessTokenGuard, AuthService, TOKEN_VERIFIER],
})
export class AuthModule {}
