// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ServerSettingsContext } from './types';
import type { ChannelSummary, MemberSummary, RoleSummary, ServerDetail } from '../servers-api';

vi.mock('../use-servers-queries', () => ({
  useCreateChannel: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateChannel: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteChannel: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ChannelsTab } from './ChannelsTab';

afterEach(() => {
  cleanup();
});

describe('ChannelsTab', () => {
  it('renders text and voice channels in their respective groups', () => {
    const ctx = buildContext({
      channels: [
        channel({ channel_id: 'ch-text-1', name: 'general', type: 'text' }),
        channel({ channel_id: 'ch-voice-1', name: '语音房', type: 'voice' }),
        channel({ channel_id: 'ch-text-2', name: 'random', type: 'text' }),
      ],
    });

    renderWith(ctx);

    expect(screen.getByText('频道管理')).toBeTruthy();
    expect(screen.getByText('文本频道 — 2')).toBeTruthy();
    expect(screen.getByText('语音频道 — 1')).toBeTruthy();
    expect(screen.getByText('general')).toBeTruthy();
    expect(screen.getByText('random')).toBeTruthy();
    expect(screen.getByText('语音房')).toBeTruthy();
  });

  it('shows empty hints when a channel type has no items', () => {
    const ctx = buildContext({
      channels: [channel({ channel_id: 'ch-text-1', name: 'general', type: 'text' })],
    });

    renderWith(ctx);

    expect(screen.getByText('文本频道 — 1')).toBeTruthy();
    expect(screen.getByText('语音频道 — 0')).toBeTruthy();
    expect(screen.getByText('暂无语音频道')).toBeTruthy();
  });
});

function renderWith(ctx: ServerSettingsContext) {
  return render(
    <MemoryRouter initialEntries={['/test']}>
      <Routes>
        <Route path="/test" element={<TestLayout ctx={ctx} />}>
          <Route index element={<ChannelsTab />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function TestLayout({ ctx }: { ctx: ServerSettingsContext }) {
  return <Outlet context={ctx} />;
}

function buildContext(overrides: { channels: ChannelSummary[] }): ServerSettingsContext {
  return {
    serverId: 'srv-1',
    server: server(overrides.channels),
    roles: [] as RoleSummary[],
    canManageRole: true,
    canManageMember: true,
    canManageChannel: true,
    canCreateInvite: true,
  };
}

function server(channels: ChannelSummary[]): ServerDetail {
  return {
    server_id: 'srv-1',
    name: 'Test Server',
    description: null,
    icon_attachment_id: null,
    owner_id: 'user-1',
    status: 'active',
    created_at: '2026-05-27T00:00:00.000Z',
    channels,
    current_member: member(),
    members: [],
    roles: [],
  };
}

function channel(input: {
  channel_id: string;
  name: string;
  type: 'text' | 'voice';
}): ChannelSummary {
  return {
    channel_id: input.channel_id,
    server_id: 'srv-1',
    name: input.name,
    type: input.type,
    topic: null,
    sort_order: 0,
    status: 'active',
    created_at: '2026-05-27T00:00:00.000Z',
    permission_overwrites: [],
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
      nickname: 'Demo',
      presence_status: 'online',
      user_id: 'user-1',
      username: 'demo',
    },
  };
}
