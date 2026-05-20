import { useAuthStore } from '../state/use-auth-store';
import { usernameColor } from '../utils/username-color';
import type { Message } from '../../features/messages/messages-api';

type MessageBubbleProps = {
  message: Message;
  onRetract?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
};

const TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
});

const FULL_TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function MessageBubble({ message, onRetract, onDelete }: MessageBubbleProps) {
  const currentUserId = useAuthStore((s) => s.currentUser?.user_id);
  const isOwn = message.sender.user_id === currentUserId;
  const visibility = message.visibility.toLowerCase();
  const isWithdrawn = visibility === 'withdrawn';
  const isDeleted = visibility === 'deleted';

  const createdAt = new Date(message.created_at);
  const time = TIME_FORMATTER.format(createdAt);
  const fullTime = FULL_TIME_FORMATTER.format(createdAt);
  const isoTime = createdAt.toISOString();

  if (isDeleted) {
    return (
      <div className="message-row message-system">
        <div className="avatar avatar-system" />
        <div>
          <span className="message-system-text">消息已被管理员删除</span>
          <time className="message-time" dateTime={isoTime} title={fullTime}>
            {time}
          </time>
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
          <time className="message-time" dateTime={isoTime} title={fullTime}>
            {time}
          </time>
        </div>
      </div>
    );
  }

  const initial = message.sender.nickname.charAt(0).toUpperCase();
  const color = usernameColor(message.sender.user_id);

  return (
    <div className="message-row">
      <div className="avatar" style={{ background: color }} aria-hidden="true">
        {initial}
      </div>
      <div>
        <div className="message-meta">
          <strong className="message-author" style={{ color }}>
            {isOwn ? '我' : message.sender.nickname}
          </strong>
          <time className="message-time" dateTime={isoTime} title={fullTime}>
            {time}
          </time>
        </div>
        <p>{message.content}</p>
        <div className="message-actions">
          {isOwn && onRetract && (
            <button
              className="message-action-btn"
              type="button"
              onClick={() => onRetract(message.message_id)}
            >
              撤回
            </button>
          )}
          {!isOwn && onDelete && (
            <button
              className="message-action-btn message-action-danger"
              type="button"
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
