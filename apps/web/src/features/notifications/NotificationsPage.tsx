import { useState } from 'react';
import { Bell, UserPlus, MessageCircle, AtSign, Check, CheckCheck } from 'lucide-react';
import { useNotificationsList, useMarkNotificationsRead } from './use-notifications-queries';
import type { Notification } from './notifications-api';

const TYPE_ICONS: Record<string, typeof Bell> = {
  channel_mention: AtSign,
  direct_message: MessageCircle,
  friend_request: UserPlus,
};

const TYPE_LABELS: Record<string, string> = {
  channel_mention: '频道提及',
  direct_message: '私聊消息',
  friend_request: '好友申请',
};

function iconFor(type: string) {
  return TYPE_ICONS[type] ?? Bell;
}

export function NotificationsPage() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const { data, isLoading } = useNotificationsList({
    is_read: filter === 'unread' ? false : undefined,
  });
  const markMutation = useMarkNotificationsRead();

  const notifications = data?.items ?? [];

  const handleClick = (n: Notification) => {
    if (!n.is_read) {
      markMutation.mutate({ notification_ids: [n.notification_id] });
    }
  };

  const handleMarkAll = () => {
    markMutation.mutate({ mark_all: true });
  };

  return (
    <div className="notifications-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h2 style={{ margin: 0 }}>通知</h2>
        <button className="mark-all-btn" onClick={handleMarkAll}>
          <CheckCheck size={14} style={{ marginRight: 4 }} />
          全部已读
        </button>
      </div>

      <div className="friends-tabs" style={{ marginBottom: 0 }}>
        <button
          className={`tab-button${filter === 'all' ? ' active' : ''}`}
          onClick={() => setFilter('all')}
        >
          全部
        </button>
        <button
          className={`tab-button${filter === 'unread' ? ' active' : ''}`}
          onClick={() => setFilter('unread')}
        >
          未读
        </button>
      </div>

      {isLoading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#6b6d70' }}>加载中...</div>
      ) : notifications.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#6b6d70' }}>
          {filter === 'unread' ? '没有未读通知' : '暂无通知'}
        </div>
      ) : (
        <ul className="notification-list">
          {notifications.map((n) => {
            const Icon = iconFor(n.type);
            return (
              <li
                key={n.notification_id}
                className={`notification-item${n.is_read ? '' : ' unread'}`}
                onClick={() => handleClick(n)}
                style={{ cursor: n.is_read ? 'default' : 'pointer' }}
              >
                <div className="notification-icon">
                  <Icon size={18} />
                </div>
                <div className="notification-body">
                  <p className="notif-title">{TYPE_LABELS[n.type] ?? n.type}</p>
                  <p className="notif-text">{n.content_preview}</p>
                  <p className="notif-time">
                    {new Date(n.created_at).toLocaleString('zh-CN')}
                  </p>
                </div>
                {!n.is_read && (
                  <div className="notification-actions">
                    <button
                      className="tiny-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        markMutation.mutate({ notification_ids: [n.notification_id] });
                      }}
                      aria-label="标记已读"
                    >
                      <Check size={12} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
