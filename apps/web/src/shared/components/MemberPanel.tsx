import { useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { fetchServerMembers } from '../../features/servers/servers-api';
import { useQuery } from '@tanstack/react-query';
import type { MemberSummary } from '../../features/servers/servers-api';
import { Spinner } from './Spinner';

function MemberItem({ member }: { member: MemberSummary }) {
  const statusLabel = member.user.presence_status.toLowerCase() === 'online' ? '在线' : '离线';
  const roleLabel = member.role_ids.length > 1 ? ` · ${member.role_ids.length} 个角色` : '';

  return (
    <li className="member-item">
      <div className="member-avatar" aria-hidden>
        {member.user.nickname.slice(0, 1).toUpperCase()}
      </div>
      <div className="member-info">
        <span className="member-name">
          {member.nick_in_server ?? member.user.nickname}
        </span>
        <span className="member-status">
          {statusLabel}{roleLabel}
        </span>
      </div>
    </li>
  );
}

export function MemberPanel() {
  const { serverId } = useParams();

  const { data: members, isLoading } = useQuery({
    queryKey: ['servers', serverId, 'members'],
    queryFn: () => fetchServerMembers(serverId!),
    enabled: !!serverId,
    staleTime: 30_000,
  });

  if (!serverId) return null;

  const online = members?.filter((m) => m.user.presence_status.toLowerCase() === 'online') ?? [];
  const offline = members?.filter((m) => m.user.presence_status.toLowerCase() !== 'online') ?? [];

  return (
    <aside className="member-panel" aria-label="成员">
      <div className="member-header">
        <Users size={18} />
        <strong>成员 — {members?.length ?? 0}</strong>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <>
          {online.length > 0 && (
            <section>
              <div className="section-title">
                <span>在线 — {online.length}</span>
              </div>
              <ul className="member-list">
                {online.map((m) => (
                  <MemberItem key={m.membership_id} member={m} />
                ))}
              </ul>
            </section>
          )}
          {offline.length > 0 && (
            <section>
              <div className="section-title">
                <span>离线 — {offline.length}</span>
              </div>
              <ul className="member-list">
                {offline.map((m) => (
                  <MemberItem key={m.membership_id} member={m} />
                ))}
              </ul>
            </section>
          )}
          {!isLoading && members?.length === 0 && (
            <div className="empty-section">暂无成员</div>
          )}
        </>
      )}
    </aside>
  );
}
