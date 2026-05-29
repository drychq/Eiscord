import { Server } from 'socket.io';

import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import { RejectingTokenVerifier } from '../../core/auth/rejecting-token.verifier';
import { PermissionsService } from '../../core/permissions/permissions.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeGateway, RealtimeSocket } from './realtime.gateway';
import { RealtimePublisher } from './realtime.publisher';
import { buildRealtimeRoom, buildUserRoom } from './realtime.rooms';

describe('realtime infrastructure', () => {
  it('builds stable room names', () => {
    expect(buildUserRoom('user-1')).toBe('user:user-1');
    expect(buildRealtimeRoom('channel', 'channel-1')).toBe('channel:channel-1');
  });

  it('publishes valid realtime envelopes to rooms', () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const publisher = new RealtimePublisher();

    publisher.bindServer({ to } as unknown as Server);

    const envelope = publisher.publishToRoom(
      'channel:channel-1',
      RealtimeEvent.MessageCreated,
      { message_id: 'message-1' },
      'request-1',
    );

    expect(to).toHaveBeenCalledWith('channel:channel-1');
    expect(emit).toHaveBeenCalledWith(RealtimeEvent.MessageCreated, envelope);
    expect(envelope).toMatchObject({
      event_name: RealtimeEvent.MessageCreated,
      payload: { message_id: 'message-1' },
      request_id: 'request-1',
    });
  });

  it('rejects unauthenticated subscriptions', async () => {
    const gateway = new RealtimeGateway(
      new RejectingTokenVerifier(),
      new PermissionsService(),
      new RealtimePublisher(),
      new AuditService(),
    );
    const emit = jest.fn();
    const socket = {
      data: {},
      emit,
      handshake: {
        auth: {},
        headers: {},
      },
      id: 'socket-1',
      join: jest.fn(),
      leave: jest.fn(),
    } as unknown as RealtimeSocket;

    const response = await gateway.handleSubscribe(socket, {
      scope_id: '00000000-0000-4000-8000-000000000001',
      scope_type: 'channel',
    });

    if (!('error' in response)) {
      throw new Error('Expected realtime subscription to fail.');
    }

    expect(response.error.code).toBe(ErrorCode.AuthRequired);
    expect(emit).toHaveBeenCalledWith('Error', response);
  });
});
