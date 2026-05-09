import { ErrorCode } from '@eiscord/shared';

import {
  AuthSession,
  TestApp,
  bearer,
  connectRealtime,
  createAcceptanceUsers,
  createFriendship,
  createServerFixture,
  disconnectSockets,
  expectErrorCode,
  getServerDetail,
  http,
  resetDatabase,
  startE2eApp,
  unwrap,
  wait,
} from './e2e-test-utils';

describe('M6 exception flow acceptance', () => {
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

  it('covers AC-E1 and AC-E2: duplicate or weak registration and wrong login failures', async () => {
    await http(testApp)
      .post('/api/v1/auth/register')
      .send({
        email_or_phone: 'alice@example.com',
        password: 'StrongPass1',
        username: 'alice',
      })
      .expect(201);

    await http(testApp)
      .post('/api/v1/auth/register')
      .send({
        email_or_phone: 'alice2@example.com',
        password: 'password',
        username: 'alice2',
      })
      .expect(400)
      .expect((response) => expectErrorCode(response.body, ErrorCode.ValidationFailed));

    await http(testApp)
      .post('/api/v1/auth/register')
      .send({
        email_or_phone: 'alice@example.com',
        password: 'StrongPass1',
        username: 'alice_dup',
      })
      .expect(409)
      .expect((response) => expectErrorCode(response.body, ErrorCode.Conflict));

    await http(testApp)
      .post('/api/v1/auth/login')
      .send({
        login_identifier: 'alice',
        password: 'WrongPass1',
      })
      .expect(401)
      .expect((response) => expectErrorCode(response.body, ErrorCode.InvalidCredentials));

    const sessions = await testApp.prisma.authSession.count();
    const auditLogs = await testApp.prisma.auditLog.findMany({
      where: { action: 'LoginUser', result: 'failure' },
    });

    expect(sessions).toBe(0);
    expect(JSON.stringify(auditLogs)).not.toContain('WrongPass1');
  });

  it('covers AC-E3: illegal friend operations are rejected', async () => {
    const { alice, bob, carol } = await createAcceptanceUsers(testApp);

    await http(testApp)
      .post('/api/v1/friend-requests')
      .set('Authorization', bearer(alice))
      .send({ target_user_id: alice.userId })
      .expect(400)
      .expect((response) => expectErrorCode(response.body, ErrorCode.ValidationFailed));

    const first = await http(testApp)
      .post('/api/v1/friend-requests')
      .set('Authorization', bearer(alice))
      .send({ target_user_id: bob.userId })
      .expect(201);
    const friendship = unwrap<{ friendship_id: string }>(first.body);

    await http(testApp)
      .post('/api/v1/friend-requests')
      .set('Authorization', bearer(alice))
      .send({ target_user_id: bob.userId })
      .expect(409)
      .expect((response) => expectErrorCode(response.body, ErrorCode.Conflict));

    await http(testApp)
      .post(`/api/v1/friend-requests/${friendship.friendship_id}/accept`)
      .set('Authorization', bearer(carol))
      .send({})
      .expect(403)
      .expect((response) => expectErrorCode(response.body, ErrorCode.PermissionDenied));
  });

  it('covers AC-E4: invalid invites, duplicate join, and owner leave restrictions', async () => {
    const { alice, bob } = await createAcceptanceUsers(testApp);
    const fixture = await createServerFixture(testApp, alice);

    await http(testApp)
      .post('/api/v1/servers/join')
      .set('Authorization', bearer(bob))
      .send({ invite_code: 'missing-code' })
      .expect(404)
      .expect((response) => expectErrorCode(response.body, ErrorCode.ResourceNotFound));

    await testApp.prisma.invitation.update({
      data: { expiresAt: new Date('2026-01-01T00:00:00.000Z') },
      where: { code: fixture.inviteCode },
    });

    await http(testApp)
      .post('/api/v1/servers/join')
      .set('Authorization', bearer(bob))
      .send({ invite_code: fixture.inviteCode })
      .expect(409)
      .expect((response) => expectErrorCode(response.body, ErrorCode.Conflict));

    await testApp.prisma.invitation.update({
      data: { expiresAt: null },
      where: { code: fixture.inviteCode },
    });
    await http(testApp)
      .post('/api/v1/servers/join')
      .set('Authorization', bearer(bob))
      .send({ invite_code: fixture.inviteCode })
      .expect(201);

    await http(testApp)
      .post('/api/v1/servers/join')
      .set('Authorization', bearer(bob))
      .send({ invite_code: fixture.inviteCode })
      .expect(409)
      .expect((response) => expectErrorCode(response.body, ErrorCode.Conflict));

    await http(testApp)
      .post(`/api/v1/servers/${fixture.serverId}/leave`)
      .set('Authorization', bearer(alice))
      .send({})
      .expect(409)
      .expect((response) => expectErrorCode(response.body, ErrorCode.Conflict));
  });

  it('covers AC-E5, AC-E6 and AC-E7: restricted resources, invalid messages, attachments, and management are rejected', async () => {
    const { alice, bob, carol } = await createAcceptanceUsers(testApp);
    await createFriendship(testApp, alice, bob);
    const fixture = await createServerFixture(testApp, alice, [bob, carol]);
    const detail = await getServerDetail(testApp, alice, fixture.serverId);
    const bobMember = detail.members.find((member) => member.user.user_id === bob.userId)!;

    await http(testApp)
      .post(`/api/v1/channels/${fixture.defaultChannelId}/messages`)
      .set('Authorization', bearer(alice))
      .send({})
      .expect(400)
      .expect((response) => expectErrorCode(response.body, ErrorCode.ValidationFailed));

    await http(testApp)
      .post(`/api/v1/channels/${fixture.defaultChannelId}/messages`)
      .set('Authorization', bearer(alice))
      .send({ content: 'x'.repeat(4001) })
      .expect(400)
      .expect((response) => expectErrorCode(response.body, ErrorCode.ValidationFailed));

    await http(testApp)
      .post(`/api/v1/channels/${fixture.defaultChannelId}/messages`)
      .set('Authorization', bearer(alice))
      .send({
        attachment_ids: ['30000000-0000-4000-8000-000000000999'],
        content: 'bad attachment',
      })
      .expect(404)
      .expect((response) => expectErrorCode(response.body, ErrorCode.ResourceNotFound));

    await http(testApp)
      .patch(`/api/v1/servers/${fixture.serverId}/members/${bobMember.membership_id}`)
      .set('Authorization', bearer(carol))
      .send({ action: 'remove' })
      .expect(403)
      .expect((response) => expectErrorCode(response.body, ErrorCode.PermissionDenied));
  });

  it('covers AC-E8: disconnect timeout releases active voice sessions', async () => {
    const { alice, bob } = await createAcceptanceUsers(testApp);
    const fixture = await createServerFixture(testApp, alice, [bob]);
    const voiceResponse = await http(testApp)
      .post(`/api/v1/servers/${fixture.serverId}/channels`)
      .set('Authorization', bearer(alice))
      .send({ name: 'voice-room', type: 'voice' })
      .expect(201);
    const voiceChannel = unwrap<{ channel_id: string }>(voiceResponse.body);
    const joinResponse = await http(testApp)
      .post(`/api/v1/voice/channels/${voiceChannel.channel_id}/join`)
      .set('Authorization', bearer(alice))
      .send({ initial_deafen_state: false, initial_mute_state: false })
      .expect(201);
    unwrap<{ session_id: string }>(joinResponse.body);

    const socket = await connectRealtime(testApp.baseUrl, alice);

    disconnectSockets(socket);
    await expectVoiceSessionsToDrain(testApp, voiceChannel.channel_id, bob);
  });
});

async function expectVoiceSessionsToDrain(
  testApp: TestApp,
  channelId: string,
  viewer: AuthSession,
): Promise<void> {
  const deadline = Date.now() + 3000;
  let lastSessions: unknown[] = [];

  while (Date.now() < deadline) {
    const activeSessions = await http(testApp)
      .get(`/api/v1/voice/channels/${channelId}/sessions`)
      .set('Authorization', bearer(viewer))
      .expect(200);

    lastSessions = unwrap<unknown[]>(activeSessions.body);
    if (lastSessions.length === 0) {
      return;
    }

    await wait(100);
  }

  expect(lastSessions).toEqual([]);
}
