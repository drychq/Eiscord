import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Bell, Menu, Search, UserPlus } from 'lucide-react';
import { useEffect } from 'react';
import { ServerRail } from './ServerRail';
import { SidePanel } from './SidePanel';
import { MemberPanel } from './MemberPanel';
import { VoiceStrip } from './VoiceStrip';
import { ErrorBoundary } from '../../shared/components/ErrorBoundary';
import { ProfilePanel } from '../../features/profile/ProfilePanel';
import { useViewport } from '../../shared/hooks/use-viewport';
import { useBackDismiss } from '../../shared/hooks/use-back-dismiss';
import { useAuthStore } from '../../shared/state/use-auth-store';
import { useWorkspaceStore } from '../../shared/state/use-workspace-store';
import { useRealtimePermissionSync } from '../../shared/hooks/use-realtime-sync';
import { useMessagesRealtime } from '../../features/messages/use-messages-queries';
import { useNotificationsRealtime } from '../../features/notifications/use-notifications-queries';
import { useFriendsRealtime } from '../../features/friends/use-friends-queries';
import { useVoiceRealtime } from '../../features/voice/use-voice-queries';
import * as socket from '../../shared/api/socket-client';

export function AppShell() {
  const viewport = useViewport();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuthStore();
  const {
    isProfilePanelOpen,
    setProfilePanelOpen,
    setRecentPath,
    isMobileNavOpen,
    setMobileNavOpen,
  } = useWorkspaceStore();

  useRealtimePermissionSync();
  useMessagesRealtime();
  useNotificationsRealtime();
  useFriendsRealtime();
  useVoiceRealtime();

  useBackDismiss(isMobileNavOpen, () => setMobileNavOpen(false));

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

  useEffect(() => {
    if (viewport === 'mobile') {
      setMobileNavOpen(false);
    }
  }, [location.pathname, viewport, setMobileNavOpen]);

  const memberPanelVisible = viewport === 'desktop';

  return (
    <div className="workspace" data-mobile-nav-open={isMobileNavOpen ? 'true' : 'false'}>
      <ServerRail />
      <SidePanel />

      {viewport === 'mobile' && isMobileNavOpen && (
        <div
          className="mobile-nav-overlay"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      <main className="message-panel">
        <header className="message-header">
          <div className="channel-heading">
            <button
              className="icon-button mobile-nav-toggle"
              type="button"
              aria-label={isMobileNavOpen ? '关闭导航' : '打开导航'}
              aria-expanded={isMobileNavOpen}
              onClick={() => setMobileNavOpen(!isMobileNavOpen)}
              style={{ display: viewport === 'mobile' ? 'flex' : 'none' }}
            >
              <Menu size={18} />
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

        <section className="message-content" aria-label="内容">
          <ErrorBoundary>
            <div key={location.pathname} className="route-fade">
              <Outlet />
            </div>
          </ErrorBoundary>
        </section>

        <VoiceStrip />
      </main>

      {memberPanelVisible && <MemberPanel />}

      <ProfilePanel />
    </div>
  );
}
