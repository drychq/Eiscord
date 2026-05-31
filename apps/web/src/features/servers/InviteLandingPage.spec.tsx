// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  status: 'idle' as 'idle' | 'authenticated' | 'expired',
  joinMutate: vi.fn(),
  joinIsError: false,
  navigate: vi.fn(),
}));

vi.mock('../../shared/state/use-auth-store', () => ({
  useAuthStore: (selector: (state: { status: string }) => unknown) =>
    selector({ status: hoisted.status }),
}));

vi.mock('./use-servers-queries', () => ({
  useJoinServer: () => ({ mutate: hoisted.joinMutate, isError: hoisted.joinIsError }),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => hoisted.navigate };
});

import { InviteLandingPage } from './InviteLandingPage';

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  hoisted.status = 'idle';
  hoisted.joinIsError = false;
  hoisted.joinMutate.mockReset();
  hoisted.navigate.mockReset();
});

describe('InviteLandingPage', () => {
  it('shows an invalid state when the invite code is missing', () => {
    renderAt('/invite');

    expect(screen.getByRole('heading', { name: '邀请无效' })).toBeTruthy();
    expect(hoisted.joinMutate).not.toHaveBeenCalled();
  });

  it('prompts unauthenticated visitors to log in before joining', () => {
    hoisted.status = 'idle';

    renderAt('/invite/abc123');

    expect(screen.getByRole('heading', { name: '你被邀请加入社区' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '登录后加入' }));
    expect(hoisted.navigate).toHaveBeenCalledWith('/login');
    expect(hoisted.joinMutate).not.toHaveBeenCalled();
  });

  it('joins automatically and shows progress when authenticated', () => {
    hoisted.status = 'authenticated';

    renderAt('/invite/abc123');

    expect(hoisted.joinMutate).toHaveBeenCalledWith(
      'abc123',
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(screen.getByRole('heading', { name: '正在加入社区' })).toBeTruthy();
  });

  it('navigates to the joined server channel on success', () => {
    hoisted.status = 'authenticated';
    hoisted.joinMutate.mockImplementation(
      (_code: string, opts?: { onSuccess?: (data: { server_id: string }) => void }) => {
        opts?.onSuccess?.({ server_id: 'srv-9' });
      },
    );

    renderAt('/invite/abc123');

    expect(hoisted.navigate).toHaveBeenCalledWith('/app/servers/srv-9/channels/default', {
      replace: true,
    });
  });

  it('shows a failure state when joining fails', () => {
    hoisted.status = 'authenticated';
    hoisted.joinIsError = true;

    renderAt('/invite/abc123');

    expect(screen.getByRole('heading', { name: '无法加入社区' })).toBeTruthy();
  });
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/invite" element={<InviteLandingPage />} />
        <Route path="/invite/:code" element={<InviteLandingPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
