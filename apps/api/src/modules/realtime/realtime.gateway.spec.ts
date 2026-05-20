import { ErrorCode } from '@eiscord/shared';

import type { TokenVerifier } from '../../common/auth/auth.types';
import type { PrismaService } from '../../common/persistence/prisma.service';
import { PermissionAction } from '../../common/permissions/permission.types';
import type { PermissionsService } from '../../common/permissions/permissions.service';
import type { AuditService } from '../audit/audit.service';
import type { PresenceService } from './presence.service';
import { RealtimeGateway } from './realtime.gateway';
import type { RealtimePublisher } from './realtime.publisher';
import type { VoiceService } from '../voice/voice.service';

const userId = () => '00000000-0000-4000-8000-000000000001';
const user = { accountStatus: 'active' as const, sessionId: 'session-1', userId: userId() };

describe('RealtimeGateway', () => {
  let tokenVerifier: { verifyAccessToken: jest.Mock };
  let prisma: { $queryRaw: jest.Mock; $executeRaw: jest.Mock; $transaction: jest.Mock };
  let permissionsService: { assertAllowed: jest.Mock };
  let publisher: { bindServer: jest.Mock; publishToRoom: jest.Mock; leaveUserRooms: jest.Mock };
  let auditService: { record: jest.Mock };
  let presenceService: { trackConnection: jest.Mock; markDisconnected: jest.Mock; heartbeat: jest.Mock };
  let voiceService: { getActiveSessionForUser: jest.Mock };
  let gateway: RealtimeGateway;

  function mockSocket(data?: Record<string, unknown>) {
    return {
      id: 'socket-1',
      data: data ?? {},
      handshake: {
        auth: {},
        headers: {},
      },
      join: jest.fn(),
      leave: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      rooms: new Set(),
    } as unknown as Parameters<RealtimeGateway['handleConnection']>[0];
  }

  beforeEach(() => {
    tokenVerifier = { verifyAccessToken: jest.fn().mockResolvedValue(user) };
    prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn(), $transaction: jest.fn() };
    permissionsService = { assertAllowed: jest.fn().mockResolvedValue(undefined) };
    publisher = { bindServer: jest.fn(), publishToRoom: jest.fn(), leaveUserRooms: jest.fn() };
    auditService = { record: jest.fn().mockResolvedValue(undefined) };
    presenceService = { trackConnection: jest.fn().mockResolvedValue(undefined), markDisconnected: jest.fn().mockResolvedValue(undefined), heartbeat: jest.fn().mockResolvedValue(undefined) };
    voiceService = { getActiveSessionForUser: jest.fn().mockResolvedValue(null) };
    gateway = new RealtimeGateway(
      tokenVerifier as unknown as TokenVerifier,
      permissionsService as unknown as PermissionsService,
      prisma as unknown as PrismaService,
      publisher as unknown as RealtimePublisher,
      auditService as unknown as AuditService,
      presenceService as unknown as PresenceService,
      voiceService as unknown as VoiceService,
    );
  });

  describe('handleConnection', () => {
    it('disconnects on missing token', async () => {
      const socket = mockSocket();
      await gateway.handleConnection(socket);
      expect(socket.emit).toHaveBeenCalledWith('Error', expect.objectContaining({
        error: expect.objectContaining({ code: ErrorCode.AuthRequired }),
      }));
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects on invalid token', async () => {
      tokenVerifier.verifyAccessToken.mockResolvedValue(null);
      const socket = mockSocket();
      socket.handshake.auth = { token: 'bad' };
      await gateway.handleConnection(socket);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects disabled account', async () => {
      tokenVerifier.verifyAccessToken.mockResolvedValue({ ...user, accountStatus: 'disabled' });
      const socket = mockSocket();
      socket.handshake.auth = { token: 'valid' };
      await gateway.handleConnection(socket);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('authenticates and joins user room on valid token', async () => {
      const socket = mockSocket();
      socket.handshake.auth = { token: 'valid' };
      await gateway.handleConnection(socket);
      expect(socket.data.user).toEqual(user);
      expect(socket.join).toHaveBeenCalledWith(expect.stringContaining(userId()));
      expect(presenceService.trackConnection).toHaveBeenCalledWith(user, socket.id, expect.any(String));
      expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'RealtimeConnect' }));
    });
  });

  describe('handleDisconnect', () => {
    it('calls markDisconnected for authenticated socket', async () => {
      const socket = mockSocket({ user });
      await gateway.handleDisconnect(socket);
      expect(presenceService.markDisconnected).toHaveBeenCalledWith(user, socket.id);
    });

    it('skips unauthenticated socket', async () => {
      const socket = mockSocket();
      await gateway.handleDisconnect(socket);
      expect(presenceService.markDisconnected).not.toHaveBeenCalled();
    });
  });

  describe('handleHeartbeat', () => {
    it('calls heartbeat for authenticated user', async () => {
      const socket = mockSocket({ user });
      const result = await gateway.handleHeartbeat(socket, {});
      expect(presenceService.heartbeat).toHaveBeenCalledWith(user, socket.id);
      expect(result).toHaveProperty('data.ok', true);
    });

    it('rejects unauthenticated heartbeat', async () => {
      const socket = mockSocket();
      const result = await gateway.handleHeartbeat(socket, {});
      expect(result).toHaveProperty('error');
    });
  });

  describe('handleSubscribe', () => {
    it('allows subscribing to own user room', async () => {
      const socket = mockSocket({ user });
      const result = await gateway.handleSubscribe(socket, { scope_type: 'user', scope_id: userId() });
      expect(result).toHaveProperty('data.ok', true);
    });

    it('denies subscribing to another user room', async () => {
      const socket = mockSocket({ user });
      const result = await gateway.handleSubscribe(socket, { scope_type: 'user', scope_id: userId().replace('1', '2') });
      expect(result).toHaveProperty('error.code', ErrorCode.PermissionDenied);
    });

    it('checks permissions for server scope', async () => {
      const socket = mockSocket({ user });
      await gateway.handleSubscribe(socket, { scope_type: 'server', scope_id: serverId() });
      expect(permissionsService.assertAllowed).toHaveBeenCalledWith(expect.objectContaining({
        action: PermissionAction.SubscribeRealtime,
      }));
    });
  });

  describe('handleUnsubscribe', () => {
    it('leaves room on unsubscribe', async () => {
      const socket = mockSocket({ user });
      const result = await gateway.handleUnsubscribe(socket, { scope_type: 'channel', scope_id: channelId() });
      expect(socket.leave).toHaveBeenCalled();
      expect(result).toHaveProperty('data.ok', true);
    });
  });

  describe('handleSyncState', () => {
    it('returns unread and voice state for authenticated user', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        { channelId: 'c-1', conversationId: null, unreadCount: 3 },
      ]);
      voiceService.getActiveSessionForUser.mockResolvedValueOnce({
        id: 'vs-1', channelId: 'vc-1', userId: userId(), muteState: 'unmuted', deafenState: 'undeafened',
        connectionStatus: 'connected', joinedAt: new Date(), updatedAt: new Date(),
      });
      const socket = mockSocket({ user });
      const result = await gateway.handleSyncState(socket);
      expect(result).toHaveProperty('data.state.unreads');
      expect(result).toHaveProperty('data.state.voice_session');
    });

    it('rejects unauthenticated SyncState', async () => {
      const socket = mockSocket();
      const result = await gateway.handleSyncState(socket);
      expect(result).toHaveProperty('error.code', ErrorCode.AuthRequired);
    });
  });
});

function serverId(): string {
  return '00000000-0000-4000-8000-000000000101';
}

function channelId(): string {
  return '00000000-0000-4000-8000-000000000401';
}
