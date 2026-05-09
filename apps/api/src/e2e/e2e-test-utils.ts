import 'reflect-metadata';

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';

import { ErrorCode, PermissionBit, RealtimeEvent } from '@eiscord/shared';

import { AppModule } from '../app.module';
import { configureApiApp } from '../common/bootstrap/configure-api-app';
import { PrismaService } from '../common/persistence/prisma.service';
import { RedisService } from '../common/redis/redis.service';

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  request_id: string;
  server_time: string;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  username: string;
};

export type TestUserInput = {
  email: string;
  password?: string;
  username: string;
};

export type TestApp = {
  app: INestApplication;
  baseUrl: string;
  prisma: PrismaService;
  redis: RedisService;
  close: () => Promise<void>;
};

const defaultPassword = 'StrongPass1';
const truncateTables = [
  'audit_logs',
  'notifications',
  'voice_sessions',
  'read_states',
  'message_mentions',
  'message_attachments',
  'messages',
  'permission_overwrites',
  'membership_roles',
  'roles',
  'memberships',
  'invitations',
  'channels',
  'servers',
  'direct_conversations',
  'friendships',
  'attachments',
  'auth_sessions',
  'users',
];

export async function startE2eApp(): Promise<TestApp> {
  process.env.NODE_ENV = 'test';
  process.env.REDIS_CONNECT_IN_TEST = 'true';
  process.env.REALTIME_SWEEP_IN_TEST = 'true';
  process.env.PRESENCE_SWEEP_INTERVAL_MS = process.env.PRESENCE_SWEEP_INTERVAL_MS ?? '100';
  process.env.PRESENCE_OFFLINE_GRACE_MS = process.env.PRESENCE_OFFLINE_GRACE_MS ?? '120';
  process.env.MEDIA_HEALTH_PORT = process.env.MEDIA_HEALTH_PORT ?? '0';

  const app = await NestFactory.create(AppModule, { logger: false });
  configureApiApp(app, app.get(ConfigService));
  await app.listen(0, '127.0.0.1');

  const prisma = app.get(PrismaService);
  const redis = app.get(RedisService);
  const baseUrl = await app.getUrl();

  return {
    app,
    baseUrl,
    prisma,
    redis,
    close: async () => {
      await app.close();
    },
  };
}

export async function resetDatabase(testApp: TestApp): Promise<void> {
  await testApp.redis.execute((client) => client.flushdb());
  await testApp.prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${truncateTables.join(', ')} RESTART IDENTITY CASCADE`,
  );
}

export function http(testApp: TestApp) {
  return request(testApp.baseUrl);
}

export function bearer(session: AuthSession): string {
  return `Bearer ${session.accessToken}`;
}

export async function registerUser(
  testApp: TestApp,
  input: TestUserInput,
): Promise<{ account_status: string; user_id: string }> {
  const response = await http(testApp)
    .post('/api/v1/auth/register')
    .send({
      email_or_phone: input.email,
      password: input.password ?? defaultPassword,
      username: input.username,
    })
    .expect(201);

  return unwrap(response.body);
}

export async function loginUser(
  testApp: TestApp,
  input: Pick<TestUserInput, 'password' | 'username'>,
): Promise<AuthSession> {
  const response = await http(testApp)
    .post('/api/v1/auth/login')
    .send({
      login_identifier: input.username,
      password: input.password ?? defaultPassword,
    })
    .expect(201);
  const data = unwrap<{
    access_token: string;
    refresh_token: string;
    user: { user_id: string; username: string };
  }>(response.body);

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    userId: data.user.user_id,
    username: data.user.username,
  };
}

export async function createRegisteredUser(
  testApp: TestApp,
  input: TestUserInput,
): Promise<AuthSession> {
  await registerUser(testApp, input);
  return loginUser(testApp, input);
}

export async function createAcceptanceUsers(testApp: TestApp) {
  const suffix = Date.now();

  const alice = await createRegisteredUser(testApp, {
    email: `alice-${suffix}@example.com`,
    username: `alice_${suffix}`,
  });
  const bob = await createRegisteredUser(testApp, {
    email: `bob-${suffix}@example.com`,
    username: `bob_${suffix}`,
  });
  const carol = await createRegisteredUser(testApp, {
    email: `carol-${suffix}@example.com`,
    username: `carol_${suffix}`,
  });

  return { alice, bob, carol };
}

export async function createFriendship(
  testApp: TestApp,
  requester: AuthSession,
  addressee: AuthSession,
): Promise<{ conversation_id: string; friendship_id: string }> {
  const requestResponse = await http(testApp)
    .post('/api/v1/friend-requests')
    .set('Authorization', bearer(requester))
    .send({ target_user_id: addressee.userId })
    .expect(201);
  const requestData = unwrap<{ friendship_id: string }>(requestResponse.body);

  const acceptResponse = await http(testApp)
    .post(`/api/v1/friend-requests/${requestData.friendship_id}/accept`)
    .set('Authorization', bearer(addressee))
    .send({})
    .expect(201);

  return unwrap(acceptResponse.body);
}

export async function createServerFixture(
  testApp: TestApp,
  owner: AuthSession,
  members: AuthSession[] = [],
) {
  const createResponse = await http(testApp)
    .post('/api/v1/servers')
    .set('Authorization', bearer(owner))
    .send({ name: `Course ${Date.now()}` })
    .expect(201);
  const created = unwrap<{
    default_channel: { channel_id: string };
    default_role: { role_id: string };
    invite_code: string;
    server: { server_id: string };
  }>(createResponse.body);

  for (const member of members) {
    await http(testApp)
      .post('/api/v1/servers/join')
      .set('Authorization', bearer(member))
      .send({ invite_code: created.invite_code })
      .expect(201);
  }

  const detail = await getServerDetail(testApp, owner, created.server.server_id);

  return {
    defaultChannelId: created.default_channel.channel_id,
    defaultRoleId: created.default_role.role_id,
    detail,
    inviteCode: created.invite_code,
    serverId: created.server.server_id,
  };
}

export async function getServerDetail(testApp: TestApp, user: AuthSession, serverId: string) {
  const response = await http(testApp)
    .get(`/api/v1/servers/${serverId}`)
    .set('Authorization', bearer(user))
    .expect(200);

  return unwrap<{
    channels: Array<{ channel_id: string; name: string; type: string }>;
    current_member: { membership_id: string; user: { user_id: string } };
    members: Array<{ membership_id: string; user: { user_id: string } }>;
    roles: Array<{ is_default: boolean; role_id: string }>;
  }>(response.body);
}

export async function createChannel(
  testApp: TestApp,
  owner: AuthSession,
  serverId: string,
  input: {
    name: string;
    permission_overwrites?: Array<{
      allow_bits: string;
      deny_bits: string;
      target_id: string;
      target_type: 'member' | 'role';
    }>;
    type: 'text' | 'voice';
  },
) {
  const response = await http(testApp)
    .post(`/api/v1/servers/${serverId}/channels`)
    .set('Authorization', bearer(owner))
    .send(input)
    .expect(201);

  return unwrap<{ channel_id: string }>(response.body);
}

export async function connectRealtime(baseUrl: string, session: AuthSession): Promise<Socket> {
  const socket = io(`${baseUrl}/realtime`, {
    auth: { token: session.accessToken },
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket connection timed out')), 5000);

    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  await waitForSocketAuthentication(socket);

  return socket;
}

export function disconnectSockets(...sockets: Array<Socket | null | undefined>): void {
  for (const socket of sockets) {
    if (socket?.connected) {
      socket.disconnect();
    }
  }
}

export function onceEvent<TPayload>(
  socket: Socket,
  eventName: RealtimeEvent,
  predicate: (payload: TPayload) => boolean = () => true,
  timeoutMs = 3000,
): Promise<{ payload: TPayload; receivedAt: number }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => {
        socket.off(eventName, handler);
        reject(new Error(`Timed out waiting for realtime event ${eventName}`));
      },
      timeoutMs,
    );
    const handler = (envelope: { payload: TPayload }) => {
      if (!predicate(envelope.payload)) {
        return;
      }

      clearTimeout(timer);
      socket.off(eventName, handler);
      resolve({ payload: envelope.payload, receivedAt: Date.now() });
    };

    socket.on(eventName, handler);
  });
}

export function emitAck<TResponse>(
  socket: Socket,
  eventName: string,
  payload?: unknown,
): Promise<TResponse> {
  return new Promise((resolve) => {
    socket.emit(eventName, payload, (response: TResponse) => resolve(response));
  });
}

async function waitForSocketAuthentication(socket: Socket): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 3000) {
    const response = await emitAck<{ data?: { ok: true }; error?: { code: ErrorCode } }>(
      socket,
      'Heartbeat',
      {},
    );

    if (response.data?.ok) {
      return;
    }

    await wait(25);
  }

  throw new Error('Socket authentication did not become ready.');
}

export async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function unwrap<T>(body: ApiEnvelope<T>): T {
  if (!body.data) {
    throw new Error(`Expected API data envelope, got ${JSON.stringify(body)}`);
  }

  return body.data;
}

export function expectErrorCode(body: ApiEnvelope<unknown>, code: ErrorCode): void {
  expect(body.error?.code).toBe(code);
}

export function permissionBits(...bits: number[]): string {
  return String(bits.reduce((combined, bit) => combined | bit, 0));
}

export const Bits = PermissionBit;
