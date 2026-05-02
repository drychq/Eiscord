import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RequestIdMiddleware } from './common/request/request-id.middleware';
import { validateEnvironment } from './common/config/env.validation';
import { AuditModule } from './modules/audit/audit.module';
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
    HealthModule,
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
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
