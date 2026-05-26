import { describe, expect, it } from 'vitest';

import { toChronologicalMessages } from './message-ordering';
import type { Message, MessagePage } from './messages-api';

describe('toChronologicalMessages', () => {
  it('flattens newest-first pages into oldest-first display order', () => {
    const newest = message('00000000-0000-4000-8000-000000000003', 'newest');
    const middle = message('00000000-0000-4000-8000-000000000002', 'middle');
    const oldest = message('00000000-0000-4000-8000-000000000001', 'oldest');
    const pages = [
      page([newest, middle], 'older'),
      page([oldest], null),
    ];

    expect(toChronologicalMessages(pages).map((item) => item.content)).toEqual([
      'oldest',
      'middle',
      'newest',
    ]);
  });

  it('does not mutate query page item arrays', () => {
    const newest = message('00000000-0000-4000-8000-000000000003', 'newest');
    const middle = message('00000000-0000-4000-8000-000000000002', 'middle');
    const oldest = message('00000000-0000-4000-8000-000000000001', 'oldest');
    const pages = [
      page([newest, middle], 'older'),
      page([oldest], null),
    ];
    const firstPageItems = [...pages[0].items];
    const secondPageItems = [...pages[1].items];

    toChronologicalMessages(pages);

    expect(pages[0].items).toEqual(firstPageItems);
    expect(pages[1].items).toEqual(secondPageItems);
  });
});

function page(items: Message[], nextCursor: string | null): MessagePage {
  return {
    items,
    next_cursor: nextCursor,
    read_state: {
      channel_id: null,
      conversation_id: '00000000-0000-4000-8000-000000000100',
      last_read_message_id: null,
      scope_type: 'dm',
      unread_count: 0,
      updated_at: '2026-05-03T00:00:00.000Z',
    },
  };
}

function message(id: string, content: string): Message {
  return {
    attachments: [],
    channel_id: null,
    content,
    conversation_id: '00000000-0000-4000-8000-000000000100',
    created_at: '2026-05-03T00:00:00.000Z',
    mentions: [],
    message_id: id,
    sender: {
      avatar_attachment_id: null,
      nickname: 'Alice',
      user_id: '00000000-0000-4000-8000-000000000200',
      username: 'alice',
    },
    visibility: 'visible',
  };
}
