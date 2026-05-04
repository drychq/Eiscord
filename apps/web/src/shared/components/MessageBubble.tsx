import { useAuthStore } from '../state/use-auth-store';
import type { Message } from '../../features/messages/messages-api';

type MessageBubbleProps = {
  message: Message;
  onRetract?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
};

export function MessageBubble({ message, onRetract, onDelete }: MessageBubbleProps) {
  const currentUserId = useAuthStore((s) => s.currentUser?.user_id);
  const isOwn = message.sender_id === currentUserId;
  const isWithdrawn = message.visibility === 'WITHDRAWN';
  const isDeleted = message.visibility === 'DELETED';

  const time = new Date(message.created_at).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isDeleted) {
    return (
      <div className="message-row message-system">
        <div className="avatar avatar-system" />
        <div>
          <span className="message-system-text">消息已被管理员删除</span>
          <span className="message-time">{time}</span>
        </div>
      </div>
    );
  }

  if (isWithdrawn) {
    return (
      <div className="message-row message-system">
        <div className="avatar avatar-system" />
        <div>
          <span className="message-system-text">消息已撤回</span>
          <span className="message-time">{time}</span>
        </div>
      </div>
    );
  }

  const initial = (message.content ?? '?').charAt(0).toUpperCase();

  return (
    <div className="message-row">
      <div className="avatar">{initial}</div>
      <div>
        <div className="message-meta">
          <strong className="message-author">{isOwn ? '我' : '用户'}</strong>
          <span>{time}</span>
        </div>
        <p>{message.content}</p>
        <div className="message-actions">
          {isOwn && onRetract && (
            <button
              className="message-action-btn"
              onClick={() => onRetract(message.message_id)}
            >
              撤回
            </button>
          )}
          {!isOwn && onDelete && (
            <button
              className="message-action-btn message-action-danger"
              onClick={() => onDelete(message.message_id)}
            >
              删除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
