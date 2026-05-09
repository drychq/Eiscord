import { PrismaClient } from '@prisma/client';
import { DEFAULT_MEMBER_PERMISSION_BITS, PermissionBit, combinePermissionBits } from '@eiscord/shared';

import { PasswordService } from '../apps/api/src/modules/auth/password.service';

const prisma = new PrismaClient();
const passwordService = new PasswordService();

const ids = {
  alice: '10000000-0000-4000-8000-000000000001',
  bob: '10000000-0000-4000-8000-000000000002',
  carol: '10000000-0000-4000-8000-000000000003',
  friendshipAliceBob: '10000000-0000-4000-8000-000000000101',
  dmAliceBob: '10000000-0000-4000-8000-000000000102',
  server: '10000000-0000-4000-8000-000000000201',
  membershipAlice: '10000000-0000-4000-8000-000000000301',
  membershipBob: '10000000-0000-4000-8000-000000000302',
  membershipCarol: '10000000-0000-4000-8000-000000000303',
  roleMember: '10000000-0000-4000-8000-000000000401',
  roleModerator: '10000000-0000-4000-8000-000000000402',
  rolePrivate: '10000000-0000-4000-8000-000000000403',
  channelGeneral: '10000000-0000-4000-8000-000000000501',
  channelPrivate: '10000000-0000-4000-8000-000000000502',
  channelVoice: '10000000-0000-4000-8000-000000000503',
  overwritePrivateDeny: '10000000-0000-4000-8000-000000000601',
  overwritePrivateAllow: '10000000-0000-4000-8000-000000000602',
  invite: '10000000-0000-4000-8000-000000000701',
};

const password = 'DemoPass1';
const moderatorBits = combinePermissionBits([
  PermissionBit.ViewChannel,
  PermissionBit.SendMessage,
  PermissionBit.ManageMessage,
  PermissionBit.ManageChannel,
  PermissionBit.JoinVoice,
  PermissionBit.ManageMember,
  PermissionBit.ManageRole,
  PermissionBit.CreateInvite,
]);
const privateBits = PermissionBit.ViewChannel | PermissionBit.SendMessage;

async function main() {
  await seedUsers();
  await seedFriendship();
  await seedServer();
  await seedReadStates();

  console.info('Eiscord demo seed ready: Alice/Bob/Carol, Course Discussion, general/private/voice-room.');
  console.info('Demo password for all users: DemoPass1');
}

async function seedUsers() {
  const users = [
    {
      id: ids.alice,
      username: 'alice',
      emailOrPhone: 'alice@example.com',
      nickname: 'Alice',
      bio: 'Course discussion owner',
    },
    {
      id: ids.bob,
      username: 'bob',
      emailOrPhone: 'bob@example.com',
      nickname: 'Bob',
      bio: 'Moderator and Alice friend',
    },
    {
      id: ids.carol,
      username: 'carol',
      emailOrPhone: 'carol@example.com',
      nickname: 'Carol',
      bio: 'Community member',
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        ...user,
        accountStatus: 'active',
        passwordHash: passwordService.hashPassword(password),
        presenceStatus: 'offline',
      },
      update: {
        accountStatus: 'active',
        bio: user.bio,
        emailOrPhone: user.emailOrPhone,
        nickname: user.nickname,
        passwordHash: passwordService.hashPassword(password),
        username: user.username,
      },
    });
  }
}

async function seedFriendship() {
  await prisma.directConversation.upsert({
    where: { id: ids.dmAliceBob },
    create: {
      id: ids.dmAliceBob,
      participantAId: ids.alice,
      participantBId: ids.bob,
    },
    update: {
      participantAId: ids.alice,
      participantBId: ids.bob,
    },
  });

  await prisma.friendship.upsert({
    where: { id: ids.friendshipAliceBob },
    create: {
      id: ids.friendshipAliceBob,
      addresseeId: ids.bob,
      requesterId: ids.alice,
      status: 'accepted',
    },
    update: {
      addresseeId: ids.bob,
      requesterId: ids.alice,
      status: 'accepted',
    },
  });
}

async function seedServer() {
  await prisma.server.upsert({
    where: { id: ids.server },
    create: {
      id: ids.server,
      description: 'Demo server for M6 acceptance flows',
      name: 'Course Discussion',
      ownerId: ids.alice,
      status: 'active',
    },
    update: {
      description: 'Demo server for M6 acceptance flows',
      name: 'Course Discussion',
      ownerId: ids.alice,
      status: 'active',
    },
  });

  await prisma.role.upsert({
    where: { id: ids.roleMember },
    create: {
      id: ids.roleMember,
      isDefault: true,
      name: 'Member',
      permissionBits: BigInt(DEFAULT_MEMBER_PERMISSION_BITS),
      priority: 0,
      serverId: ids.server,
    },
    update: {
      isDefault: true,
      name: 'Member',
      permissionBits: BigInt(DEFAULT_MEMBER_PERMISSION_BITS),
      priority: 0,
    },
  });

  await prisma.role.upsert({
    where: { id: ids.roleModerator },
    create: {
      id: ids.roleModerator,
      color: '#3b82f6',
      name: 'Moderator',
      permissionBits: BigInt(moderatorBits),
      priority: 10,
      serverId: ids.server,
    },
    update: {
      color: '#3b82f6',
      name: 'Moderator',
      permissionBits: BigInt(moderatorBits),
      priority: 10,
    },
  });

  await prisma.role.upsert({
    where: { id: ids.rolePrivate },
    create: {
      id: ids.rolePrivate,
      color: '#16a34a',
      name: 'Private Channel',
      permissionBits: BigInt(privateBits),
      priority: 1,
      serverId: ids.server,
    },
    update: {
      color: '#16a34a',
      name: 'Private Channel',
      permissionBits: BigInt(privateBits),
      priority: 1,
    },
  });

  await seedMembership(ids.membershipAlice, ids.alice);
  await seedMembership(ids.membershipBob, ids.bob);
  await seedMembership(ids.membershipCarol, ids.carol);

  await seedMembershipRole(ids.membershipAlice, ids.roleMember, ids.alice);
  await seedMembershipRole(ids.membershipBob, ids.roleMember, ids.alice);
  await seedMembershipRole(ids.membershipBob, ids.roleModerator, ids.alice);
  await seedMembershipRole(ids.membershipBob, ids.rolePrivate, ids.alice);
  await seedMembershipRole(ids.membershipCarol, ids.roleMember, ids.alice);

  await seedChannel(ids.channelGeneral, 'general', 'text', 0);
  await seedChannel(ids.channelPrivate, 'private', 'text', 1);
  await seedChannel(ids.channelVoice, 'voice-room', 'voice', 2);

  await prisma.permissionOverwrite.upsert({
    where: { id: ids.overwritePrivateDeny },
    create: {
      id: ids.overwritePrivateDeny,
      allowBits: 0n,
      channelId: ids.channelPrivate,
      denyBits: BigInt(PermissionBit.ViewChannel),
      targetId: ids.roleMember,
      targetType: 'role',
    },
    update: {
      allowBits: 0n,
      denyBits: BigInt(PermissionBit.ViewChannel),
      targetId: ids.roleMember,
      targetType: 'role',
    },
  });

  await prisma.permissionOverwrite.upsert({
    where: { id: ids.overwritePrivateAllow },
    create: {
      id: ids.overwritePrivateAllow,
      allowBits: BigInt(privateBits),
      channelId: ids.channelPrivate,
      denyBits: 0n,
      targetId: ids.rolePrivate,
      targetType: 'role',
    },
    update: {
      allowBits: BigInt(privateBits),
      denyBits: 0n,
      targetId: ids.rolePrivate,
      targetType: 'role',
    },
  });

  await prisma.invitation.upsert({
    where: { id: ids.invite },
    create: {
      id: ids.invite,
      code: 'COURSE-M6',
      createdById: ids.alice,
      maxUses: null,
      serverId: ids.server,
      status: 'active',
    },
    update: {
      code: 'COURSE-M6',
      createdById: ids.alice,
      expiresAt: null,
      maxUses: null,
      serverId: ids.server,
      status: 'active',
    },
  });
}

async function seedMembership(membershipId: string, userId: string) {
  await prisma.membership.upsert({
    where: { id: membershipId },
    create: {
      id: membershipId,
      memberStatus: 'active',
      serverId: ids.server,
      userId,
    },
    update: {
      memberStatus: 'active',
      serverId: ids.server,
      userId,
    },
  });
}

async function seedMembershipRole(membershipId: string, roleId: string, assignedById: string) {
  await prisma.membershipRole.upsert({
    where: {
      membershipId_roleId: {
        membershipId,
        roleId,
      },
    },
    create: {
      assignedById,
      membershipId,
      roleId,
    },
    update: {
      assignedById,
    },
  });
}

async function seedChannel(channelId: string, name: string, type: 'text' | 'voice', sortOrder: number) {
  await prisma.channel.upsert({
    where: { id: channelId },
    create: {
      id: channelId,
      name,
      serverId: ids.server,
      sortOrder,
      status: 'active',
      type,
    },
    update: {
      name,
      serverId: ids.server,
      sortOrder,
      status: 'active',
      type,
    },
  });
}

async function seedReadStates() {
  const users = [ids.alice, ids.bob, ids.carol];
  const textChannels = [ids.channelGeneral, ids.channelPrivate];

  for (const userId of users) {
    for (const channelId of textChannels) {
      await prisma.readState.upsert({
        where: {
          userId_channelId: {
            channelId,
            userId,
          },
        },
        create: {
          channelId,
          scopeType: 'channel',
          unreadCount: 0,
          userId,
        },
        update: {
          scopeType: 'channel',
        },
      });
    }
  }

  for (const userId of [ids.alice, ids.bob]) {
    await prisma.readState.upsert({
      where: {
        userId_conversationId: {
          conversationId: ids.dmAliceBob,
          userId,
        },
      },
      create: {
        conversationId: ids.dmAliceBob,
        scopeType: 'dm',
        unreadCount: 0,
        userId,
      },
      update: {
        scopeType: 'dm',
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
