// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ServerSettingsContext } from './types';
import type { MemberSummary, RoleSummary } from '../servers-api';

vi.mock('../use-servers-queries', () => ({
  useManageMember: () => ({ mutate: vi.fn(), isPending: false }),
  useAssignRole: () => ({ mutate: vi.fn(), isPending: false }),
  useRemoveRole: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { MembersTab } from './MembersTab';

afterEach(() => {
  cleanup();
});

describe('MembersTab', () => {
  it('groups members by presence and tags the owner', () => {
    const owner = member({ user_id: 'user-1', nickname: 'Owner', presence: 'online' });
    const onlineMember = member({
      user_id: 'user-2',
      nickname: 'Alice',
      presence: 'online',
      membership_id: 'mem-2',
    });
    const offlineMember = member({
      user_id: 'user-3',
      nickname: 'Bob',
      presence: 'offline',
      membership_id: 'mem-3',
    });

    renderWith(
      buildContext({
        members: [owner, onlineMember, offlineMember],
        ownerId: 'user-1',
      }),
    );

    expect(screen.getByText('成员管理')).toBeTruthy();
    expect(screen.getByText('在线 — 2')).toBeTruthy();
    expect(screen.getByText('离线 — 1')).toBeTruthy();
    expect(screen.getByText('所有者')).toBeTruthy();
    expect(screen.getAllByLabelText('管理角色')).toHaveLength(2);
  });

  it('hides management actions when canManageMember is false', () => {
    renderWith(
      buildContext({
        members: [member({ user_id: 'user-2', nickname: 'Alice', presence: 'online' })],
        ownerId: 'user-1',
        canManageMember: false,
      }),
    );

    expect(screen.queryByLabelText('管理角色')).toBeNull();
    expect(screen.queryByLabelText('禁言')).toBeNull();
    expect(screen.queryByLabelText('移除')).toBeNull();
  });
});

function renderWith(ctx: ServerSettingsContext) {
  return render(
    <MemoryRouter initialEntries={['/test']}>
      <Routes>
        <Route path="/test" element={<TestLayout ctx={ctx} />}>
          <Route index element={<MembersTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function TestLayout({ ctx }: { ctx: ServerSettingsContext }) {
  return <Outlet context={ctx} />;
}

function buildContext(overrides: {
  members: MemberSummary[];
  ownerId: string;
  canManageMember?: boolean;
}): ServerSettingsContext {
  return {
    serverId: 'srv-1',
    server: {
      server_id: 'srv-1',
      name: 'Test Server',
      description: null,
      icon_attachment_id: null,
      owner_id: overrides.ownerId,
      status: 'active',
      created_at: '2026-05-27T00:00:00.000Z',
      channels: [],
      current_member: overrides.members[0],
      members: overrides.members,
      roles: [],
    },
    roles: [] as RoleSummary[],
    canManageRole: true,
    canManageMember: overrides.canManageMember ?? true,
    canManageChannel: true,
  };
}

function member(input: {
  user_id: string;
  nickname: string;
  presence: string;
  membership_id?: string;
}): MemberSummary {
  return {
    joined_at: '2026-05-27T00:00:00.000Z',
    member_status: 'active',
    membership_id: input.membership_id ?? 'mem-1',
    nick_in_server: null,
    role_ids: [],
    server_id: 'srv-1',
    user: {
      avatar_attachment_id: null,
      nickname: input.nickname,
      presence_status: input.presence,
      user_id: input.user_id,
      username: input.nickname.toLowerCase(),
    },
  };
}
