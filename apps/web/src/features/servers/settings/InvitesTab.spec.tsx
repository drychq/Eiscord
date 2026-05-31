// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ServerSettingsContext } from './types';
import type { InviteSummary, MemberSummary, RoleSummary, ServerDetail } from '../servers-api';

const hoisted = vi.hoisted(() => ({
  invitesResult: { data: undefined as InviteSummary[] | undefined, isLoading: false },
  createMutate: vi.fn(),
  revokeMutate: vi.fn(),
}));

vi.mock('../use-servers-queries', () => ({
  useServerInvites: () => hoisted.invitesResult,
  useCreateInvite: () => ({ mutate: hoisted.createMutate, isPending: false }),
  useRevokeInvite: () => ({ mutate: hoisted.revokeMutate, isPending: false }),
}));

import { InvitesTab } from './InvitesTab';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  hoisted.invitesResult = { data: undefined, isLoading: false };
  hoisted.createMutate.mockReset();
  hoisted.revokeMutate.mockReset();
});

describe('InvitesTab', () => {
  it('shows a spinner while invites are loading', () => {
    hoisted.invitesResult = { data: undefined, isLoading: true };

    renderWith(buildContext());

    expect(screen.getByLabelText('加载中')).toBeTruthy();
  });

  it('shows an empty state when there are no invites', () => {
    hoisted.invitesResult = { data: [], isLoading: false };

    renderWith(buildContext());

    expect(screen.getByText('暂无邀请')).toBeTruthy();
  });

  it('renders each invite with its code, creator and use count', () => {
    hoisted.invitesResult = { data: [invite({ code: 'abc123', usedCount: 3 })], isLoading: false };

    renderWith(buildContext());

    expect(screen.getByText('abc123')).toBeTruthy();
    expect(screen.getByText(/已使用 3 次/)).toBeTruthy();
    expect(screen.getByLabelText('复制邀请链接 abc123')).toBeTruthy();
    expect(screen.getByLabelText('撤销邀请 abc123')).toBeTruthy();
  });

  it('hides the generate button when the user cannot create invites', () => {
    hoisted.invitesResult = { data: [], isLoading: false };

    renderWith(buildContext({ canCreateInvite: false }));

    expect(screen.queryByRole('button', { name: '生成邀请' })).toBeNull();
  });

  it('creates an invite when the generate button is clicked', () => {
    hoisted.invitesResult = { data: [], isLoading: false };

    renderWith(buildContext({ canCreateInvite: true }));
    fireEvent.click(screen.getByRole('button', { name: '生成邀请' }));

    expect(hoisted.createMutate).toHaveBeenCalledTimes(1);
  });

  it('copies the invite link to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    hoisted.invitesResult = { data: [invite({ code: 'abc123' })], isLoading: false };

    renderWith(buildContext());
    fireEvent.click(screen.getByLabelText('复制邀请链接 abc123'));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/invite/abc123`),
    );
  });

  it('revokes an invite after confirming in the dialog', () => {
    hoisted.invitesResult = {
      data: [invite({ code: 'abc123', inviteId: 'inv-1' })],
      isLoading: false,
    };

    renderWith(buildContext());
    fireEvent.click(screen.getByLabelText('撤销邀请 abc123'));

    expect(screen.getByText(/确定要撤销邀请/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '撤销' }));

    expect(hoisted.revokeMutate).toHaveBeenCalledWith(
      'inv-1',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});

function renderWith(ctx: ServerSettingsContext) {
  return render(
    <MemoryRouter initialEntries={['/test']}>
      <Routes>
        <Route path="/test" element={<TestLayout ctx={ctx} />}>
          <Route index element={<InvitesTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function TestLayout({ ctx }: { ctx: ServerSettingsContext }) {
  return <Outlet context={ctx} />;
}

function buildContext(overrides: { canCreateInvite?: boolean } = {}): ServerSettingsContext {
  return {
    serverId: 'srv-1',
    server: server(),
    roles: [] as RoleSummary[],
    canManageRole: true,
    canManageMember: true,
    canManageChannel: true,
    canCreateInvite: overrides.canCreateInvite ?? true,
  };
}

function server(): ServerDetail {
  return {
    server_id: 'srv-1',
    name: 'Test Server',
    description: null,
    icon_attachment_id: null,
    owner_id: 'user-1',
    status: 'active',
    created_at: '2026-05-27T00:00:00.000Z',
    channels: [],
    current_member: member(),
    members: [],
    roles: [],
  };
}

function member(): MemberSummary {
  return {
    joined_at: '2026-05-27T00:00:00.000Z',
    member_status: 'active',
    membership_id: 'mem-1',
    nick_in_server: null,
    role_ids: [],
    server_id: 'srv-1',
    user: {
      avatar_attachment_id: null,
      nickname: 'Owner',
      presence_status: 'online',
      user_id: 'user-1',
      username: 'owner',
    },
  };
}

function invite(input: { code: string; inviteId?: string; usedCount?: number }): InviteSummary {
  return {
    code: input.code,
    created_at: '2026-05-27T00:00:00.000Z',
    creator: {
      avatar_attachment_id: null,
      nickname: 'Alice',
      user_id: 'user-1',
      username: 'alice',
    },
    expires_at: null,
    invite_id: input.inviteId ?? 'inv-1',
    max_uses: null,
    server_id: 'srv-1',
    status: 'active',
    used_count: input.usedCount ?? 0,
  };
}
