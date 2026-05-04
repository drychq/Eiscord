import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import * as socket from '../../shared/api/socket-client';
import { useDmMessages, useSendDmMessage, useDeleteMessage } from './use-messages-queries';
import { MessageList } from '../../shared/components/MessageList';
import { MessageBubble } from '../../shared/components/MessageBubble';
import { MessageComposer } from '../../shared/components/MessageComposer';

export function MessagesPage() {
  const { conversationId } = useParams<{ conversationId: string }>();

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useDmMessages(conversationId ?? null);

  const sendMutation = useSendDmMessage(conversationId ?? '');
  const deleteMutation = useDeleteMessage();

  const messages = data?.pages.flatMap((p) => p.items) ?? [];

  useEffect(() => {
    if (!conversationId) {
      return undefined;
    }

    socket.subscribe('dm', conversationId);

    return () => {
      socket.unsubscribe('dm', conversationId);
    };
  }, [conversationId]);

  const handleSend = (content: string) => {
    if (!conversationId) return;
    sendMutation.mutate({ content });
  };

  const handleRetract = (messageId: string) => {
    deleteMutation.mutate({ messageId, operation: 'retract' });
  };

  return (
    <>
      <MessageList
        hasMore={!!hasNextPage}
        isLoading={isLoading}
        isLoadingMore={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        emptyMessage="暂无消息，发送第一条消息吧"
      >
        {messages.map((msg) => (
          <MessageBubble
            key={msg.message_id}
            message={msg}
            onRetract={handleRetract}
          />
        ))}
      </MessageList>

      <MessageComposer onSend={handleSend} disabled={sendMutation.isPending} />
    </>
  );
}
