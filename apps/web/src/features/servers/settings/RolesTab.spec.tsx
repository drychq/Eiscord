// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ServerSettingsContext } from './types';
import type { MemberSummary, RoleSummary, ServerDetail } from '../servers-api';

vi.mock('../use-servers-queries', () => ({
  useCreateRole: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateRole: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteRole: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { RolesTab } from './RolesTab';

afterEach(() => {
  cleanup();
});

describe('RolesTab', () => {
  it('renders roles sorted by priority desc', () => {
    const ctx = buildContext({
      roles: [
        role({ role_id: 'r-default', name: '默认成员', priority: 0, is_default: true }),
        role({ role_id: 'r-admin', name: '管理员', priority: 100 }),
        role({ role_id: 'r-mod', name: '版主', priority: 50 }),
      ],
    });

    renderWith(ctx);

    expect(screen.getByText('角色管理')).toBeTruthy();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('管理员');
    expect(items[1].textContent).toContain('版主');
    expect(items[2].textContent).toContain('默认成员');
  });

  it('hides edit actions on default roles', () => {
    const ctx = buildContext({
      roles: [
        role({ role_id: 'r-default', name: '默认成员', is_default: true }),
        role({ role_id: 'r-mod', name: '版主' }),
      ],
    });

    renderWith(ctx);

    expect(screen.queryByLabelText('编辑 默认成员')).toBeNull();
    expect(screen.getByLabelText('编辑 版主')).toBeTruthy();
  });
});

function renderWith(ctx: ServerSettingsContext) {
  return render(
    <MemoryRouter initialEntries={['/test']}>
      <Routes>
        <Route path="/test" element={<TestLayout ctx={ctx} />}>
          <Route index element={<RolesTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function TestLayout({ ctx }: { ctx: ServerSettingsContext }) {
  return <Outlet context={ctx} />;
}

function buildContext(overrides: { roles: RoleSummary[] }): ServerSettingsContext {
  return {
    serverId: 'srv-1',
    server: server(overrides.roles),
    roles: overrides.roles,
    canManageRole: true,
    canManageMember: true,
    canManageChannel: true,
    canCreateInvite: true,
  };
}

function server(roles: RoleSummary[]): ServerDetail {
  return {
    server_id: 'srv-1',
    name: 'Test Server',
    description: null,
    icon_attachment_id: null,
    owner_id: 'user-1',
    status: 'active',
    created_at: '2026-05-27T00:00:00.000Z',
    channels: [],
    current_member: member({ user_id: 'user-1' }),
    members: [],
    roles,
  };
}

function role(input: Partial<RoleSummary>): RoleSummary {
  return {
    role_id: input.role_id ?? 'role-default',
    server_id: 'srv-1',
    name: input.name ?? 'Test Role',
    color: input.color ?? null,
    priority: input.priority ?? 0,
    permission_bits: input.permission_bits ?? '0',
    is_default: input.is_default ?? false,
  };
}

function member(input: { user_id: string }): MemberSummary {
  return {
    joined_at: '2026-05-27T00:00:00.000Z',
    member_status: 'active',
    membership_id: 'mem-1',
    nick_in_server: null,
    role_ids: [],
    server_id: 'srv-1',
    user: {
      avatar_attachment_id: null,
      nickname: 'Demo',
      presence_status: 'online',
      user_id: input.user_id,
      username: 'demo',
    },
  };
}
