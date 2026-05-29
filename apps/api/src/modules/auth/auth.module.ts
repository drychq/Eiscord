import { Module } from '@nestjs/common';

import { AccessTokenGuard } from '../../core/auth/access-token.guard';
import { TOKEN_VERIFIER } from '../../core/auth/auth.types';
import { AuditModule } from '../audit/audit.module';
import { MailerModule } from '../mailer/mailer.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';
import { PrismaTokenVerifier } from './prisma-token.verifier';
import { TokenService } from './token.service';

@Module({
  imports: [AuditModule, MailerModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordResetService,
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
