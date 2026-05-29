import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AccessTokenGuard } from './core/auth/access-token.guard';
import { ApiExceptionFilter } from './core/http/api-exception.filter';
import { ApiResponseInterceptor } from './core/http/api-response.interceptor';
import { PermissionGuard } from './core/permissions/permission.guard';
import { RequestIdMiddleware } from './core/request/request-id.middleware';
import { validateEnvironment } from './infra/config/env.validation';
import { PersistenceModule } from './infra/persistence/persistence.module';
import { RateLimitGuard } from './core/rate-limit/rate-limit.guard';
import { RedisModule } from './infra/redis/redis.module';
import { AuditModule } from './modules/audit/audit.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { FriendsModule } from './modules/friends/friends.module';
import { HealthModule } from './modules/health/health.module';
import { MessagesModule } from './modules/messages/messages.module';
import { MediaSignalingModule } from './modules/media-signaling/media-signaling.module';
import { MailerModule } from './modules/mailer/mailer.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ServersModule } from './modules/servers/servers.module';
import { UsersModule } from './modules/users/users.module';
import { VoiceModule } from './modules/voice/voice.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    PersistenceModule,
    RedisModule,
    HealthModule,
    AttachmentsModule,
    AuthModule,
    UsersModule,
    FriendsModule,
    ServersModule,
    ChannelsModule,
    MessagesModule,
    NotificationsModule,
    PermissionsModule,
    VoiceModule,
    MediaSignalingModule,
    RealtimeModule,
    MailerModule,
    AuditModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiResponseInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: AccessTokenGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
