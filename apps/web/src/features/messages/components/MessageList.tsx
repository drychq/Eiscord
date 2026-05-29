import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import { Spinner } from '../../../shared/components/Spinner';
import { EmptyState } from '../../../shared/components/EmptyState';
import { MessageSquare } from 'lucide-react';

type MessageListProps = {
  children: ReactNode;
  conversationKey?: string | null;
  hasMore?: boolean;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  latestMessageId?: string | null;
  onLoadMore?: () => Promise<unknown> | void;
  emptyMessage?: string;
};

const BOTTOM_STICKINESS_PX = 80;

export function MessageList({
  children,
  conversationKey,
  hasMore = false,
  isLoading = false,
  isLoadingMore = false,
  latestMessageId,
  onLoadMore,
  emptyMessage = '暂无消息',
}: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const conversationKeyRef = useRef<string | null | undefined>(undefined);
  const hasInitializedConversationRef = useRef(false);
  const latestMessageIdRef = useRef<string | null | undefined>(undefined);
  const loadRequestedRef = useRef(false);
  const pendingTopLoadRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const childCount = React.Children.count(children);
  const isEmpty = !hasMore && childCount === 0;

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;

    el.scrollTop = el.scrollHeight;
    shouldStickToBottomRef.current = true;
  }, []);

  useEffect(() => {
    if (!isLoadingMore) {
      loadRequestedRef.current = false;
    }
  }, [isLoadingMore]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const handleScroll = () => {
      shouldStickToBottomRef.current = isNearBottom(el);
    };

    handleScroll();
    el.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      el.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    const listEl = listRef.current;
    const sentinelEl = sentinelRef.current;

    if (!listEl || !sentinelEl || !hasMore || !onLoadMore || isLoadingMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || loadRequestedRef.current) return;

        pendingTopLoadRef.current = {
          scrollHeight: listEl.scrollHeight,
          scrollTop: listEl.scrollTop,
        };
        shouldStickToBottomRef.current = isNearBottom(listEl);
        loadRequestedRef.current = true;
        onLoadMore();
      },
      {
        root: listEl,
        rootMargin: '120px 0px 0px 0px',
      },
    );

    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, onLoadMore]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const conversationChanged =
      !hasInitializedConversationRef.current ||
      conversationKey !== conversationKeyRef.current;

    if (conversationChanged) {
      hasInitializedConversationRef.current = true;
      conversationKeyRef.current = conversationKey;
      latestMessageIdRef.current = latestMessageId;
      pendingTopLoadRef.current = null;
      scrollToBottom();
      return;
    }

    const pendingTopLoad = pendingTopLoadRef.current;

    if (pendingTopLoad && !isLoadingMore) {
      const heightDelta = el.scrollHeight - pendingTopLoad.scrollHeight;
      el.scrollTop = pendingTopLoad.scrollTop + heightDelta;
      shouldStickToBottomRef.current = isNearBottom(el);
      pendingTopLoadRef.current = null;
      latestMessageIdRef.current = latestMessageId;
      return;
    }

    if (latestMessageId !== latestMessageIdRef.current) {
      const shouldScroll =
        shouldStickToBottomRef.current || latestMessageIdRef.current == null;

      latestMessageIdRef.current = latestMessageId;

      if (shouldScroll) {
        scrollToBottom();
      }
    }
  }, [childCount, conversationKey, isLoadingMore, latestMessageId, scrollToBottom]);

  if (isLoading) {
    return (
      <div ref={listRef} className="message-list">
        <div className="message-list-inner message-list-inner-empty">
          <EmptyState icon={MessageSquare} title="加载中..." />
        </div>
      </div>
    );
  }

  return (
    <div ref={listRef} className="message-list">
      <div className={`message-list-inner${isEmpty ? ' message-list-inner-empty' : ''}`}>
        {hasMore && (
          <div ref={sentinelRef} className="message-sentinel">
            {isLoadingMore && <Spinner size={20} />}
          </div>
        )}
        {children}
        {isEmpty && <EmptyState icon={MessageSquare} title={emptyMessage} />}
      </div>
    </div>
  );
}

function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= BOTTOM_STICKINESS_PX;
}
