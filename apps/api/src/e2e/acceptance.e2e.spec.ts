import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import {
  Bits,
  TestApp,
  bearer,
  connectRealtime,
  createAcceptanceUsers,
  createChannel,
  createFriendship,
  createServerFixture,
  disconnectSockets,
  emitAck,
  expectErrorCode,
  getServerDetail,
  http,
  onceEvent,
  permissionBits,
  resetDatabase,
  startE2eApp,
  unwrap,
  wait,
} from './e2e-test-utils';

describe('M6 API + Socket acceptance flows', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await startE2eApp();
  });

  beforeEach(async () => {
    await resetDatabase(testApp);
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('covers AC-01 and AC-05: users become friends, exchange DMs, and sync unread/notifications in realtime', async () => {
    const { alice, bob } = await createAcceptanceUsers(testApp);
    const bobSocket = await connectRealtime(testApp.baseUrl, bob);

    try {
      const friendNotification = onceEvent<{ type: string }>(
        bobSocket,
        RealtimeEvent.NotificationCreated,
        (payload) => payload.type === 'friend_request',
      );
      const requestResponse = await http(testApp)
        .post('/api/v1/friend-requests')
        .set('Authorization', bearer(alice))
        .send({ target_user_id: bob.userId })
        .expect(201);
      const requestData = unwrap<{ friendship_id: string }>(requestResponse.body);

      await expect(friendNotification).resolves.toBeTruthy();

      await http(testApp)
        .post(`/api/v1/friend-requests/${requestData.friendship_id}/accept`)
        .set('Authorization', bearer(bob))
        .send({})
        .expect(201);
      const dmResponse = await http(testApp)
        .get('/api/v1/dm-conversations')
        .set('Authorization', bearer(alice))
        .expect(200);
      const [dm] = unwrap<Array<{ conversation_id: string }>>(dmResponse.body);
      const subscribeAck = await emitAck<{ data?: { ok: true } }>(bobSocket, 'Subscribe', {
        scope_id: dm.conversation_id,
        scope_type: 'dm',
      });
      expect(subscribeAck.data?.ok).toBe(true);

      const messageArrival = onceEvent<{ content: string | null }>(
        bobSocket,
        RealtimeEvent.MessageCreated,
        (payload) => payload.content === 'hello bob from acceptance',
      );
      const unreadArrival = onceEvent<{ conversation_id: string | null; unread_count: number }>(
        bobSocket,
        RealtimeEvent.UnreadUpdated,
        (payload) => payload.conversation_id === dm.conversation_id && payload.unread_count > 0,
      );
      const dmNotification = onceEvent<{ type: string }>(
        bobSocket,
        RealtimeEvent.NotificationCreated,
        (payload) => payload.type === 'direct_message',
      );
      const sentAt = Date.now();

      await http(testApp)
        .post(`/api/v1/dm-conversations/${dm.conversation_id}/messages`)
        .set('Authorization', bearer(alice))
        .send({ content: 'hello bob from acceptance' })
        .expect(201);

      const messageEvent = await messageArrival;
      expect(messageEvent.receivedAt - sentAt).toBeLessThan(1000);
      await expect(unreadArrival).resolves.toBeTruthy();
      await expect(dmNotification).resolves.toBeTruthy();
    } finally {
      disconnectSockets(bobSocket);
    }
  });

  it('covers AC-02, AC-04 and AC-05: server channel messages, mentions, and restricted channel permissions', async () => {
    const { alice, bob, carol } = await createAcceptanceUsers(testApp);
    const fixture = await createServerFixture(testApp, alice, [bob, carol]);
    const ownerDetail = await getServerDetail(testApp, alice, fixture.serverId);
    const defaultRole = ownerDetail.roles.find((role) => role.is_default);
    expect(defaultRole).toBeTruthy();

    const privateChannel = await createChannel(testApp, alice, fixture.serverId, {
      name: 'private',
      permission_overwrites: [
        {
          allow_bits: '0',
          deny_bits: permissionBits(Bits.ViewChannel),
          target_id: defaultRole!.role_id,
          target_type: 'role',
        },
      ],
      type: 'text',
    });

    await http(testApp)
      .get(`/api/v1/channels/${privateChannel.channel_id}/messages`)
      .set('Authorization', bearer(carol))
      .expect(403)
      .expect((response) => expectErrorCode(response.body, ErrorCode.PermissionDenied));

    const bobSocket = await connectRealtime(testApp.baseUrl, bob);

    try {
      const channelAck = await emitAck<{ data?: { ok: true }; error?: { code: ErrorCode } }>(bobSocket, 'Subscribe', {
        scope_id: fixture.defaultChannelId,
        scope_type: 'channel',
      });
      expect(channelAck.data?.ok).toBe(true);

      const messageArrival = onceEvent<{ content: string | null }>(
        bobSocket,
        RealtimeEvent.MessageCreated,
        (payload) => payload.content === 'general hello with mention',
      );
      const mentionNotification = onceEvent<{ type: string }>(
        bobSocket,
        RealtimeEvent.NotificationCreated,
        (payload) => payload.type === 'channel_mention',
      );

      const sendResponse = await http(testApp)
        .post(`/api/v1/channels/${fixture.defaultChannelId}/messages`)
        .set('Authorization', bearer(alice))
        .send({
          content: 'general hello with mention',
          mention_user_ids: [bob.userId],
        })
        .expect(201);
      const sentMessage = unwrap<{ content: string | null; mentions: string[] }>(sendResponse.body);

      expect(sentMessage.mentions).toContain(bob.userId);
      await expect(messageArrival).resolves.toBeTruthy();
      await expect(mentionNotification).resolves.toBeTruthy();
    } finally {
      disconnectSockets(bobSocket);
    }
  });

  it('covers AC-03 and AC-06: presence, voice state, SyncState, and disconnect compensation', async () => {
    const { alice, bob } = await createAcceptanceUsers(testApp);
    await createFriendship(testApp, alice, bob);
    const fixture = await createServerFixture(testApp, alice, [bob]);
    const voiceChannel = await createChannel(testApp, alice, fixture.serverId, {
      name: 'voice-room',
      type: 'voice',
    });
    const aliceSocket = await connectRealtime(testApp.baseUrl, alice);
    const bobSocket = await connectRealtime(testApp.baseUrl, bob);

    try {
      const voiceAck = await emitAck<{ data?: { ok: true }; error?: { code: ErrorCode } }>(bobSocket, 'Subscribe', {
        scope_id: voiceChannel.channel_id,
        scope_type: 'voice',
      });
      expect(voiceAck.data?.ok).toBe(true);

      const presenceArrival = onceEvent<{ user_id: string; visible_status: string }>(
        bobSocket,
        RealtimeEvent.PresenceChanged,
        (payload) => payload.user_id === alice.userId && payload.visible_status === 'idle',
      );
      await http(testApp)
        .patch('/api/v1/users/me/presence')
        .set('Authorization', bearer(alice))
        .send({ desired_status: 'idle' })
        .expect(200);
      await expect(presenceArrival).resolves.toBeTruthy();

      const joinedArrival = onceEvent<{ session_id: string; user_id: string }>(
        bobSocket,
        RealtimeEvent.VoiceMemberJoined,
        (payload) => payload.user_id === alice.userId,
      );
      const joinResponse = await http(testApp)
        .post(`/api/v1/voice/channels/${voiceChannel.channel_id}/join`)
        .set('Authorization', bearer(alice))
        .send({ initial_deafen_state: false, initial_mute_state: false })
        .expect(201);
      const session = unwrap<{ session_id: string }>(joinResponse.body);
      await expect(joinedArrival).resolves.toBeTruthy();

      const stateArrival = onceEvent<{ mute_state: boolean; session_id: string }>(
        bobSocket,
        RealtimeEvent.VoiceStateChanged,
        (payload) => payload.session_id === session.session_id && payload.mute_state,
      );
      await http(testApp)
        .patch(`/api/v1/voice/sessions/${session.session_id}/state`)
        .set('Authorization', bearer(alice))
        .send({ mute_state: true })
        .expect(200);
      await expect(stateArrival).resolves.toBeTruthy();

      disconnectSockets(bobSocket);
      await http(testApp)
        .post(`/api/v1/dm-conversations/${(await getDmConversationId(testApp, alice)).conversationId}/messages`)
        .set('Authorization', bearer(alice))
        .send({ content: 'offline sync message' })
        .expect(201);
      const bobReconnect = await connectRealtime(testApp.baseUrl, bob);
      const syncResponse = await emitAck<{
        data?: { state: { unreads: Array<{ conversationId: string; unreadCount: number }> } };
      }>(bobReconnect, 'SyncState', {});
      expect(syncResponse.data?.state.unreads.some((item) => item.unreadCount > 0)).toBe(true);
      await emitAck(bobReconnect, 'Subscribe', {
        scope_id: voiceChannel.channel_id,
        scope_type: 'voice',
      });

      const leftArrival = onceEvent<{ reason: string; user_id: string }>(
        bobReconnect,
        RealtimeEvent.VoiceMemberLeft,
        (payload) => payload.user_id === alice.userId,
      );
      disconnectSockets(aliceSocket);
      await wait(500);
      const meResponse = await http(testApp)
        .get('/api/v1/users/me')
        .set('Authorization', bearer(alice))
        .expect(200);
      expect(unwrap<{ presence_status: string }>(meResponse.body).presence_status).toBe('offline');
      await expect(leftArrival).resolves.toBeTruthy();
      disconnectSockets(bobReconnect);
    } finally {
      disconnectSockets(aliceSocket, bobSocket);
    }
  });
});

async function getDmConversationId(testApp: TestApp, user: { accessToken: string }) {
  const response = await http(testApp)
    .get('/api/v1/dm-conversations')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .expect(200);
  const [conversation] = unwrap<Array<{ conversation_id: string }>>(response.body);

  return { conversationId: conversation.conversation_id };
}
