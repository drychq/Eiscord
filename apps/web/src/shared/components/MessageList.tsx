import React, { useEffect, useRef, type ReactNode } from 'react';
import { Spinner } from './Spinner';
import { EmptyState } from './EmptyState';
import { MessageSquare } from 'lucide-react';

type MessageListProps = {
  children: ReactNode;
  hasMore?: boolean;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  emptyMessage?: string;
};

export function MessageList({
  children,
  hasMore = false,
  isLoading = false,
  isLoadingMore = false,
  onLoadMore,
  emptyMessage = '暂无消息',
}: MessageListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || !onLoadMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onLoadMore();
      },
      { rootMargin: '120px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, onLoadMore]);

  if (isLoading) {
    return (
      <div className="message-list">
        <EmptyState icon={MessageSquare} title="加载中..." />
      </div>
    );
  }

  return (
    <div className="message-list">
      {children}
      {hasMore && (
        <div ref={sentinelRef} className="message-sentinel">
          {isLoadingMore && <Spinner size={20} />}
        </div>
      )}
      {!hasMore && !React.Children.count(children) && (
        <EmptyState icon={MessageSquare} title={emptyMessage} />
      )}
    </div>
  );
}
