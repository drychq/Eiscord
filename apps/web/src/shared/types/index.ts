export type EntityId = string;

export type CursorPage<TItem> = {
  items: TItem[];
  next_cursor: string | null;
  has_more: boolean;
};
