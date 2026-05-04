import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import * as socket from '../../shared/api/socket-client';
import {
  useChannelMessages,
  useSendChannelMessage,
  useDeleteMessage,
} from '../messages/use-messages-queries';
import { MessageList } from '../../shared/components/MessageList';
import { MessageBubble } from '../../shared/components/MessageBubble';
import { MessageComposer } from '../../shared/components/MessageComposer';

export function ServerChannelsPage() {
  const { channelId } = useParams<{ channelId: string }>();

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useChannelMessages(channelId ?? null);

  const sendMutation = useSendChannelMessage(channelId ?? '');
  const deleteMutation = useDeleteMessage();

  const messages = data?.pages.flatMap((p) => p.items) ?? [];

  useEffect(() => {
    if (!channelId) {
      return undefined;
    }

    socket.subscribe('channel', channelId);

    return () => {
      socket.unsubscribe('channel', channelId);
    };
  }, [channelId]);

  const handleSend = (content: string) => {
    if (!channelId) return;
    sendMutation.mutate({ content });
  };

  const handleRetract = (messageId: string) => {
    deleteMutation.mutate({ messageId, operation: 'retract' });
  };

  const handleDelete = (messageId: string) => {
    deleteMutation.mutate({ messageId, operation: 'delete' });
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
            onDelete={handleDelete}
          />
        ))}
      </MessageList>

      <MessageComposer onSend={handleSend} disabled={sendMutation.isPending} />
    </>
  );
}
