import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import * as socket from '../../shared/api/socket-client';
import {
  useChannelMessages,
  useSendChannelMessage,
  useDeleteMessage,
} from '../messages/use-messages-queries';
import { toChronologicalMessages } from '../messages/message-ordering';
import { useServerDetail } from './use-servers-queries';
import { MessageList } from '../../shared/components/MessageList';
import { MessageBubble } from '../../shared/components/MessageBubble';
import { MessageComposer } from '../../shared/components/MessageComposer';

export function ServerChannelsPage() {
  const { serverId, channelId } = useParams<{ channelId: string; serverId: string }>();
  const resolvedChannelId = isUuid(channelId) ? channelId : null;
  const { data: server } = useServerDetail(!resolvedChannelId ? (serverId ?? null) : null);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useChannelMessages(resolvedChannelId);

  const sendMutation = useSendChannelMessage(resolvedChannelId ?? '');
  const deleteMutation = useDeleteMessage();

  const messages = toChronologicalMessages(data?.pages);
  const latestMessageId = messages.at(-1)?.message_id ?? null;

  useEffect(() => {
    if (!resolvedChannelId) {
      return undefined;
    }

    socket.subscribe('channel', resolvedChannelId);

    return () => {
      socket.unsubscribe('channel', resolvedChannelId);
    };
  }, [resolvedChannelId]);

  const handleSend = (content: string) => {
    if (!resolvedChannelId) return;
    sendMutation.mutate({ content });
  };

  const handleRetract = (messageId: string) => {
    deleteMutation.mutate({ messageId, operation: 'retract' });
  };

  const handleDelete = (messageId: string) => {
    deleteMutation.mutate({ messageId, operation: 'delete' });
  };

  if (!resolvedChannelId) {
    const firstTextChannel = server?.channels.find(
      (item) => item.type === 'text' || item.type === 'TEXT',
    );

    if (serverId && firstTextChannel) {
      return (
        <Navigate
          to={`/app/servers/${serverId}/channels/${firstTextChannel.channel_id}`}
          replace
        />
      );
    }
  }

  return (
    <>
      <MessageList
        conversationKey={resolvedChannelId}
        hasMore={!!hasNextPage}
        isLoading={isLoading}
        isLoadingMore={isFetchingNextPage}
        latestMessageId={latestMessageId}
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

function isUuid(value: string | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
