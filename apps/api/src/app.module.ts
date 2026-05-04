import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { ApiResponseInterceptor } from './common/http/api-response.interceptor';
import { RequestIdMiddleware } from './common/request/request-id.middleware';
import { validateEnvironment } from './common/config/env.validation';
import { PersistenceModule } from './common/persistence/persistence.module';
import { RateLimitGuard } from './common/rate-limit/rate-limit.guard';
import { RedisModule } from './common/redis/redis.module';
import { AuditModule } from './modules/audit/audit.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChannelsModule } from './modules/channels/channels.module';
import { FriendsModule } from './modules/friends/friends.module';
import { HealthModule } from './modules/health/health.module';
import { MessagesModule } from './modules/messages/messages.module';
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
    RealtimeModule,
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
      useClass: RateLimitGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
