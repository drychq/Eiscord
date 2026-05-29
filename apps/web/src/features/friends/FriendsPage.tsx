import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Clock, Users, MessageCircle, Check, X, Search } from 'lucide-react';
import { Spinner } from '../../shared/components/Spinner';
import { FormField } from '../../shared/components/FormField';
import { formatErrorMessage } from '../../shared/utils/error-message';
import {
  useFriendsList,
  useDmConversations,
  useCreateFriendRequest,
  useAcceptFriendRequest,
  useRejectFriendRequest,
  useUserSearch,
} from './use-friends-queries';
import type { FriendshipSummary, DirectConversationSummary, UserSearchResult } from './friends-api';

type Tab = 'friends' | 'pending' | 'add';

const usernamePattern = /^[a-zA-Z0-9_]{3,32}$/;

function FriendItem({ friendship, onDm }: { friendship: FriendshipSummary; onDm: (conversationId: string) => void }) {
  const { friend, conversation_id } = friendship;
  const statusLabel = friend.presence_status.toLowerCase() === 'online' ? '在线' : '离线';

  return (
    <li className="friend-item" aria-label={`${friend.nickname} @${friend.username} ${statusLabel}`}>
      <div className="friend-avatar" aria-hidden>
        {friend.nickname.slice(0, 1).toUpperCase()}
      </div>
      <div className="friend-info">
        <span className="friend-name">{friend.nickname}</span>
        <span className="friend-username">@{friend.username}</span>
        <span className={`friend-status ${friend.presence_status.toLowerCase()}`}>{statusLabel}</span>
      </div>
      {conversation_id && (
        <button className="icon-button" type="button" aria-label={`与 ${friend.nickname} 私聊`} onClick={() => onDm(conversation_id!)}>
          <MessageCircle size={18} />
        </button>
      )}
    </li>
  );
}

function PendingItem({ friendship }: { friendship: FriendshipSummary }) {
  const accept = useAcceptFriendRequest();
  const reject = useRejectFriendRequest();
  const isIncoming = friendship.direction === 'incoming';

  return (
    <li
      className="friend-item"
      aria-label={`${friendship.friend.nickname} @${friendship.friend.username} ${
        isIncoming ? '待你处理' : '等待对方'
      }`}
    >
      <div className="friend-avatar" aria-hidden>
        {friendship.friend.nickname.slice(0, 1).toUpperCase()}
      </div>
      <div className="friend-info">
        <span className="friend-name">{friendship.friend.nickname}</span>
        <span className="friend-username">@{friendship.friend.username}</span>
        <span className="friend-status">{isIncoming ? '待你处理' : '等待对方'}</span>
      </div>
      {isIncoming && (
        <div className="friend-actions">
          <button
            className="icon-button"
            type="button"
            aria-label="接受"
            disabled={accept.isPending}
            onClick={() => accept.mutate(friendship.friendship_id)}
          >
            <Check size={18} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="拒绝"
            disabled={reject.isPending}
            onClick={() => reject.mutate(friendship.friendship_id)}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </li>
  );
}

function DmItem({ dm, onClick }: { dm: DirectConversationSummary; onClick: (id: string) => void }) {
  return (
    <li className="friend-item" aria-label={`${dm.friend.nickname} @${dm.friend.username}`}>
      <div className="friend-avatar" aria-hidden>
        {dm.friend.nickname.slice(0, 1).toUpperCase()}
      </div>
      <div className="friend-info">
        <span className="friend-name">{dm.friend.nickname}</span>
        <span className="friend-username">@{dm.friend.username}</span>
      </div>
      <button className="icon-button" type="button" aria-label={`与 ${dm.friend.nickname} 私聊`} onClick={() => onClick(dm.conversation_id)}>
        <MessageCircle size={18} />
      </button>
    </li>
  );
}

function relationLabel(relationship: UserSearchResult['relationship_status']): string {
  switch (relationship) {
    case 'accepted':
      return '已是好友';
    case 'pending_incoming':
      return '待你处理';
    case 'pending_outgoing':
      return '已发送';
    case 'self':
      return '当前账号';
    case 'none':
    default:
      return '可添加';
  }
}

function UserSearchItem({
  result,
  isSubmitting,
  onAdd,
  onViewPending,
}: {
  result: UserSearchResult;
  isSubmitting: boolean;
  onAdd: (userId: string) => void;
  onViewPending: () => void;
}) {
  const { relationship_status, user } = result;
  const isAddable = relationship_status === 'none';
  const isIncoming = relationship_status === 'pending_incoming';
  const statusLabel = user.presence_status.toLowerCase() === 'online' ? '在线' : '离线';

  return (
    <li
      className="friend-item user-search-item"
      aria-label={`${user.nickname} @${user.username} ${relationLabel(relationship_status)}`}
    >
      <div className="friend-avatar" aria-hidden>
        {user.nickname.slice(0, 1).toUpperCase()}
      </div>
      <div className="friend-info">
        <span className="friend-name">{user.nickname}</span>
        <span className="friend-username">@{user.username}</span>
        <span className={`friend-status ${user.presence_status.toLowerCase()}`}>{statusLabel}</span>
      </div>
      <span className={`friend-relation-badge ${relationship_status}`}>
        {relationLabel(relationship_status)}
      </span>
      {isIncoming ? (
        <button className="button-secondary friend-action-button" type="button" onClick={onViewPending}>
          去处理
        </button>
      ) : (
        <button
          className="button-primary friend-action-button"
          type="button"
          disabled={!isAddable || isSubmitting}
          onClick={() => onAdd(user.user_id)}
        >
          {isAddable ? '添加' : relationLabel(relationship_status)}
        </button>
      )}
    </li>
  );
}

export function FriendsPage() {
  const [tab, setTab] = useState<Tab>('friends');
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const { data: friendships, isLoading: friendsLoading } = useFriendsList();
  const { data: dms, isLoading: dmsLoading } = useDmConversations();
  const createRequest = useCreateFriendRequest();
  const searchResults = useUserSearch(searchQuery);
  const canSearch = searchInput.trim().length >= 2;

  const accepted = friendships?.filter((f) => f.status.toLowerCase() === 'accepted') ?? [];
  const pending = friendships?.filter((f) => f.status.toLowerCase() === 'pending') ?? [];

  const tabs: { key: Tab; label: string; icon: typeof Users }[] = [
    { key: 'friends', label: `好友 (${accepted.length})`, icon: Users },
    { key: 'pending', label: `待处理 (${pending.length})`, icon: Clock },
    { key: 'add', label: '添加好友', icon: UserPlus },
  ];

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  const handleDirectAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const username = searchInput.trim().toLowerCase();

    if (!usernamePattern.test(username)) {
      return;
    }

    createRequest.mutate({ target_username: username });
  };

  if (friendsLoading || dmsLoading) return <Spinner />;

  return (
    <div className="friends-page">
      <div className="friends-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tab-button ${tab === t.key ? 'active' : ''}`}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            <t.icon size={16} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="friends-content" role="tabpanel">
        {tab === 'friends' && (
          <section aria-label="好友列表">
            {accepted.length === 0 ? (
              <p className="empty-section">暂无好友，去添加吧</p>
            ) : (
              <ul className="friend-list">
                {accepted.map((f) => (
                  <FriendItem key={f.friendship_id} friendship={f} onDm={(id) => navigate(`/app/dm/${id}`)} />
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'pending' && (
          <section aria-label="待处理申请">
            {pending.length === 0 ? (
              <p className="empty-section">没有待处理的好友申请</p>
            ) : (
              <ul className="friend-list">
                {pending.map((f) => (
                  <PendingItem key={f.friendship_id} friendship={f} />
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'add' && (
          <section aria-label="添加好友">
            <FormField
              label="搜索用户"
              error={createRequest.error ? formatErrorMessage(createRequest.error) : undefined}
              htmlFor="friend-search"
            >
              <form className="user-search-form" onSubmit={handleDirectAdd}>
                <div className="user-search-input-wrap">
                  <Search size={18} aria-hidden />
                  <input
                    id="friend-search"
                    className="form-input"
                    type="search"
                    placeholder="搜索用户名或昵称"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    disabled={createRequest.isPending}
                  />
                </div>
                <button
                  className="button-primary"
                  type="submit"
                  disabled={createRequest.isPending || !usernamePattern.test(searchInput.trim())}
                >
                  {createRequest.isPending ? '发送中...' : '按用户名添加'}
                </button>
              </form>
            </FormField>

            {!canSearch && (
              <p className="empty-section">输入至少 2 个字符搜索用户</p>
            )}

            {canSearch && searchResults.isLoading && <Spinner size={24} />}

            {canSearch && searchResults.error && (
              <p className="empty-section" role="alert">
                {formatErrorMessage(searchResults.error)}
              </p>
            )}

            {canSearch && searchResults.data && searchResults.data.length === 0 && (
              <p className="empty-section">没有找到匹配用户</p>
            )}

            {canSearch && searchResults.data && searchResults.data.length > 0 && (
              <ul className="friend-list user-search-results">
                {searchResults.data.map((result) => (
                  <UserSearchItem
                    key={result.user.user_id}
                    result={result}
                    isSubmitting={createRequest.isPending}
                    onAdd={(userId) => createRequest.mutate({ target_user_id: userId })}
                    onViewPending={() => setTab('pending')}
                  />
                ))}
              </ul>
            )}
          </section>
        )}

        {dms && dms.length > 0 && (
          <section aria-label="私聊会话" style={{ marginTop: 24 }}>
            <h3 className="section-title">私聊会话</h3>
            <ul className="friend-list">
              {dms.map((dm) => (
                <DmItem key={dm.conversation_id} dm={dm} onClick={(id) => navigate(`/app/dm/${id}`)} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
