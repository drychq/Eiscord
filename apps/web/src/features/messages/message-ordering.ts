import type { Message, MessagePage } from './messages-api';

export function toChronologicalMessages(pages: readonly MessagePage[] | undefined): Message[] {
  return (pages?.flatMap((page) => page.items) ?? []).reverse();
}
