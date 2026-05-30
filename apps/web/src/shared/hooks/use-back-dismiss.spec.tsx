// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useBackDismiss } from './use-back-dismiss';

afterEach(() => {
  cleanup();
});

function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
  useBackDismiss(open, onClose);
  const location = useLocation();
  const navigate = useNavigate();
  const mark = (location.state as { overlay?: number } | null)?.overlay;
  return (
    <div>
      <span data-testid="mark">{mark == null ? 'none' : String(mark)}</span>
      <button type="button" onClick={() => navigate(-1)}>
        back
      </button>
    </div>
  );
}

function renderHarness(open: boolean) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <Harness open={open} onClose={onClose} />
    </MemoryRouter>,
  );
  return onClose;
}

describe('useBackDismiss', () => {
  it('closes on Escape when open', () => {
    const onClose = renderHarness(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape when closed', () => {
    const onClose = renderHarness(false);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('pushes a sentinel history entry when opened', async () => {
    renderHarness(true);
    await waitFor(() => expect(screen.getByTestId('mark').textContent).not.toBe('none'));
  });

  it('closes when the back navigation pops the sentinel entry', async () => {
    const onClose = renderHarness(true);
    await waitFor(() => expect(screen.getByTestId('mark').textContent).not.toBe('none'));
    fireEvent.click(screen.getByText('back'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
