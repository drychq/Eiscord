import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Bell, Search, UserPlus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { ServerRail } from './ServerRail';
import { SidePanel } from './SidePanel';
import { MemberPanel } from './MemberPanel';
import { VoiceStrip } from './VoiceStrip';
import { ProfilePanel } from '../../features/profile/ProfilePanel';
import { useViewport } from '../hooks/use-viewport';
import { useAuthStore } from '../state/use-auth-store';
import { useWorkspaceStore } from '../state/use-workspace-store';
import { useRealtimeEventSync, useRealtimePermissionSync } from '../hooks/use-realtime-sync';
import * as socket from '../api/socket-client';

export function AppShell() {
  const viewport = useViewport();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuthStore();
  const { isProfilePanelOpen, setProfilePanelOpen, setRecentPath } = useWorkspaceStore();
  const [showNav, setShowNav] = useState(false);

  useRealtimePermissionSync();
  useRealtimeEventSync();

  useEffect(() => {
    const token = useAuthStore.getState().accessToken;
    if (token && !socket.isConnected()) {
      socket.connect(token);
    }
  }, []);

  useEffect(() => {
    if (location.pathname !== '/app') {
      setRecentPath(location.pathname);
    }
  }, [location.pathname, setRecentPath]);

  const memberPanelVisible = viewport === 'desktop';

  return (
    <div className="workspace">
      <ServerRail />
      <SidePanel />

      <main className="message-panel">
        <header className="message-header">
          <div className="channel-heading">
            <button
              className="icon-button mobile-nav-toggle"
              type="button"
              aria-label="切换导航"
              onClick={() => setShowNav(!showNav)}
              style={{ display: viewport === 'mobile' ? 'flex' : 'none' }}
            >
              <UserPlus size={18} />
            </button>
            <strong>Eiscord</strong>
          </div>
          <div className="header-actions">
            <button className="icon-button" type="button" aria-label="好友" onClick={() => navigate('/app/friends')}>
              <UserPlus size={18} />
            </button>
            <button className="icon-button" type="button" aria-label="通知" onClick={() => navigate('/app/notifications')}>
              <Bell size={18} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="个人资料"
              onClick={() => setProfilePanelOpen(!isProfilePanelOpen)}
              title={currentUser?.nickname ?? '个人资料'}
            >
              <span style={{ fontSize: 12, fontWeight: 800 }}>
                {(currentUser?.nickname ?? currentUser?.username ?? '?').slice(0, 1)}
              </span>
            </button>
            <button className="search-button" type="button" aria-label="搜索" disabled>
              <Search size={16} />
              <span>P1</span>
            </button>
          </div>
        </header>

        <section className="message-list" aria-label="内容">
          <Outlet />
        </section>

        <VoiceStrip />
      </main>

      {memberPanelVisible && <MemberPanel />}

      <ProfilePanel />
    </div>
  );
}
