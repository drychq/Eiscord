import { ErrorCode, RealtimeEvent } from '@eiscord/shared';

import {
  Bits,
  TestApp,
  bearer,
  connectRealtime,
  createAcceptanceUsers,
  createChannel,
  createRegisteredUser,
  createServerFixture,
  disconnectSockets,
  emitAck,
  expectErrorCode,
  getServerDetail,
  http,
  permissionBits,
  resetDatabase,
  startE2eApp,
  unwrap,
} from './e2e-test-utils';

describe('M6 permission matrix acceptance', () => {
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

  it.each([
    ['GET', '/api/v1/users/me'],
    ['GET', '/api/v1/friends'],
    ['POST', '/api/v1/servers'],
    ['GET', '/api/v1/notifications'],
  ])('rejects guests for protected %s %s operations', async (method, path) => {
    const agent = http(testApp);
    const response =
      method === 'GET'
        ? await agent.get(path).expect(401)
        : await agent.post(path).send({ name: 'Nope' }).expect(401);

    expectErrorCode(response.body, ErrorCode.AuthRequired);
  });

  it('rejects non-members and ordinary members across HTTP, Socket, attachment, and history paths', async () => {
    const { alice, bob, carol } = await createAcceptanceUsers(testApp);
    const outsider = await createRegisteredUser(testApp, {
      email: 'mallory@example.com',
      username: 'mallory',
    });
    const fixture = await createServerFixture(testApp, alice, [bob, carol]);
    const ownerDetail = await getServerDetail(testApp, alice, fixture.serverId);
    const defaultRole = ownerDetail.roles.find((role) => role.is_default)!;
    const privateChannel = await createChannel(testApp, alice, fixture.serverId, {
      name: 'private',
      permission_overwrites: [
        {
          allow_bits: '0',
          deny_bits: permissionBits(Bits.ViewChannel),
          target_id: defaultRole.role_id,
          target_type: 'role',
        },
      ],
      type: 'text',
    });

    await http(testApp)
      .get(`/api/v1/servers/${fixture.serverId}/members`)
      .set('Authorization', bearer(outsider))
      .expect(403)
      .expect((response) => expectErrorCode(response.body, ErrorCode.PermissionDenied));

    await http(testApp)
      .get(`/api/v1/channels/${privateChannel.channel_id}/messages`)
      .set('Authorization', bearer(carol))
      .expect(403)
      .expect((response) => expectErrorCode(response.body, ErrorCode.PermissionDenied));

    const carolSocket = await connectRealtime(testApp.baseUrl, carol);
    try {
      const subscribeResponse = await emitAck<{ error?: { code: ErrorCode } }>(
        carolSocket,
        'Subscribe',
        {
          scope_id: privateChannel.channel_id,
          scope_type: 'channel',
        },
      );
      expect(subscribeResponse.error?.code).toBe(ErrorCode.PermissionDenied);
    } finally {
      disconnectSockets(carolSocket);
    }

    const messageResponse = await http(testApp)
      .post(`/api/v1/channels/${fixture.defaultChannelId}/messages`)
      .set('Authorization', bearer(alice))
      .send({ content: 'attachment protected message' })
      .expect(201);
    const message = unwrap<{ message_id: string }>(messageResponse.body);
    const attachmentId = '20000000-0000-4000-8000-000000000901';

    await testApp.prisma.$executeRaw`
      INSERT INTO attachments (
        id,
        owner_id,
        storage_key,
        file_name,
        mime_type,
        size_bytes,
        purpose,
        status
      )
      VALUES (
        ${attachmentId}::uuid,
        ${alice.userId}::uuid,
        'demo/protected.txt',
        'protected.txt',
        'text/plain',
        10,
        'message',
        'ready'
      )
    `;
    await testApp.prisma.$executeRaw`
      INSERT INTO message_attachments (message_id, attachment_id)
      VALUES (${message.message_id}::uuid, ${attachmentId}::uuid)
    `;

    await http(testApp)
      .get(`/api/v1/attachments/${attachmentId}`)
      .set('Authorization', bearer(outsider))
      .expect(403)
      .expect((response) => expectErrorCode(response.body, ErrorCode.PermissionDenied));
  });

  it('rejects ordinary member management, role assignment, and deleting other users messages', async () => {
    const { alice, bob, carol } = await createAcceptanceUsers(testApp);
    const fixture = await createServerFixture(testApp, alice, [bob, carol]);
    const detail = await getServerDetail(testApp, alice, fixture.serverId);
    const bobMember = detail.members.find((member) => member.user.user_id === bob.userId)!;
    const carolMember = detail.members.find((member) => member.user.user_id === carol.userId)!;
    const defaultRole = detail.roles.find((role) => role.is_default)!;

    await http(testApp)
      .patch(`/api/v1/servers/${fixture.serverId}/members/${bobMember.membership_id}`)
      .set('Authorization', bearer(carol))
      .send({ action: 'mute' })
      .expect(403)
      .expect((response) => expectErrorCode(response.body, ErrorCode.PermissionDenied));

    await http(testApp)
      .post(`/api/v1/servers/${fixture.serverId}/members/${carolMember.membership_id}/roles`)
      .set('Authorization', bearer(bob))
      .send({ role_id: defaultRole.role_id })
      .expect(403)
      .expect((response) => expectErrorCode(response.body, ErrorCode.PermissionDenied));

    const messageResponse = await http(testApp)
      .post(`/api/v1/channels/${fixture.defaultChannelId}/messages`)
      .set('Authorization', bearer(alice))
      .send({ content: 'owner message' })
      .expect(201);
    const message = unwrap<{ message_id: string }>(messageResponse.body);

    await http(testApp)
      .post(`/api/v1/messages/${message.message_id}/delete`)
      .set('Authorization', bearer(carol))
      .send({ operation: 'delete' })
      .expect(403)
      .expect((response) => expectErrorCode(response.body, ErrorCode.PermissionDenied));
  });

  it('allows owner while preventing a lower priority manager from targeting higher priority members', async () => {
    const { alice, bob, carol } = await createAcceptanceUsers(testApp);
    const fixture = await createServerFixture(testApp, alice, [bob, carol]);
    let detail = await getServerDetail(testApp, alice, fixture.serverId);
    const bobMember = detail.members.find((member) => member.user.user_id === bob.userId)!;
    const carolMember = detail.members.find((member) => member.user.user_id === carol.userId)!;

    const lowRoleResponse = await http(testApp)
      .post(`/api/v1/servers/${fixture.serverId}/roles`)
      .set('Authorization', bearer(alice))
      .send({
        name: 'Low manager',
        permission_bits: permissionBits(Bits.ViewChannel, Bits.ManageMember),
        priority: 1,
      })
      .expect(201);
    const highRoleResponse = await http(testApp)
      .post(`/api/v1/servers/${fixture.serverId}/roles`)
      .set('Authorization', bearer(alice))
      .send({
        name: 'High target',
        permission_bits: permissionBits(Bits.ViewChannel),
        priority: 5,
      })
      .expect(201);
    const lowRole = unwrap<{ role_id: string }>(lowRoleResponse.body);
    const highRole = unwrap<{ role_id: string }>(highRoleResponse.body);

    await http(testApp)
      .post(`/api/v1/servers/${fixture.serverId}/members/${bobMember.membership_id}/roles`)
      .set('Authorization', bearer(alice))
      .send({ role_id: lowRole.role_id })
      .expect(201);
    await http(testApp)
      .post(`/api/v1/servers/${fixture.serverId}/members/${carolMember.membership_id}/roles`)
      .set('Authorization', bearer(alice))
      .send({ role_id: highRole.role_id })
      .expect(201);

    await http(testApp)
      .patch(`/api/v1/servers/${fixture.serverId}/members/${carolMember.membership_id}`)
      .set('Authorization', bearer(bob))
      .send({ action: 'mute' })
      .expect(403)
      .expect((response) => expectErrorCode(response.body, ErrorCode.PermissionDenied));

    const bobSocket = await connectRealtime(testApp.baseUrl, bob);
    const serverAck = await emitAck<{ data?: { ok: true }; error?: { code: ErrorCode } }>(
      bobSocket,
      'Subscribe',
      { scope_id: fixture.serverId, scope_type: 'server' },
    );
    expect(serverAck.data?.ok).toBe(true);
    const changed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('MemberChanged not received')), 5000);

      bobSocket.once(RealtimeEvent.MemberChanged, (payload) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

    await http(testApp)
      .patch(`/api/v1/servers/${fixture.serverId}/members/${bobMember.membership_id}`)
      .set('Authorization', bearer(alice))
      .send({ action: 'mute' })
      .expect(200);
    await expect(changed).resolves.toBeTruthy();
    disconnectSockets(bobSocket);

    detail = await getServerDetail(testApp, alice, fixture.serverId);
    expect(detail.members.find((member) => member.user.user_id === bob.userId)?.membership_id).toBe(
      bobMember.membership_id,
    );
  });
});
