// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import type { UserSummary } from '@eiscord/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Message } from '../../features/messages/messages-api';
import { useAuthStore } from '../state/use-auth-store';
import { MessageBubble } from './MessageBubble';

const CURRENT_USER_ID = '00000000-0000-4000-8000-000000000100';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000200';

describe('MessageBubble', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      currentUser: user(CURRENT_USER_ID, 'Demo Me'),
      status: 'authenticated',
    });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      currentUser: null,
      status: 'idle',
    });
  });

  it('marks current user messages for right-aligned layout', () => {
    render(
      <MessageBubble
        message={message({
          content: 'my message',
          senderId: CURRENT_USER_ID,
          senderNickname: 'Demo Me',
        })}
        onRetract={() => undefined}
      />,
    );

    const row = screen.getByText('我').closest('.message-row');

    expect(row?.classList.contains('message-row-own')).toBe(true);
    expect(screen.getByText('my message')).toBeTruthy();
    expect(screen.queryByText('Demo Me')).toBeNull();
  });

  it('keeps other user messages on the default left-aligned layout', () => {
    render(
      <MessageBubble
        message={message({
          content: 'their message',
          senderId: OTHER_USER_ID,
          senderNickname: 'Alice',
        })}
        onDelete={() => undefined}
      />,
    );

    const row = screen.getByText('Alice').closest('.message-row');

    expect(row?.classList.contains('message-row-own')).toBe(false);
    expect(screen.getByText('their message')).toBeTruthy();
    expect(screen.queryByText('我')).toBeNull();
  });
});

function user(userId: string, nickname: string): UserSummary {
  return {
    account_status: 'active',
    avatar_attachment_id: null,
    bio: null,
    created_at: '2026-05-03T00:00:00.000Z',
    nickname,
    presence_status: 'online',
    user_id: userId,
    username: nickname.toLowerCase().replace(/\s+/g, '.'),
  };
}

function message(input: {
  content: string;
  senderId: string;
  senderNickname: string;
}): Message {
  return {
    attachments: [],
    channel_id: null,
    content: input.content,
    conversation_id: '00000000-0000-4000-8000-000000000300',
    created_at: '2026-05-03T00:00:00.000Z',
    mentions: [],
    message_id: '00000000-0000-4000-8000-000000000400',
    sender: {
      avatar_attachment_id: null,
      nickname: input.senderNickname,
      user_id: input.senderId,
      username: input.senderNickname.toLowerCase().replace(/\s+/g, '.'),
    },
    visibility: 'visible',
  };
}
