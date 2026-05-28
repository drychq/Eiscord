import { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '../shared/components/ProtectedRoute';
import { PublicOnlyRoute } from '../shared/components/PublicOnlyRoute';
import { AppShell } from '../shared/components/AppShell';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { RolesTab } from '../features/servers/settings/RolesTab';
import { MembersTab } from '../features/servers/settings/MembersTab';
import { ChannelsTab } from '../features/servers/settings/ChannelsTab';
import { RouteContainer } from './RouteContainer';
import { useWorkspaceStore } from '../shared/state/use-workspace-store';

const FriendsPage = lazy(() =>
  import('../features/friends/FriendsPage').then((m) => ({ default: m.FriendsPage })),
);
const MessagesPage = lazy(() =>
  import('../features/messages/MessagesPage').then((m) => ({ default: m.MessagesPage })),
);
const NotificationsPage = lazy(() =>
  import('../features/notifications/NotificationsPage').then((m) => ({
    default: m.NotificationsPage,
  })),
);
const ServerChannelsPage = lazy(() =>
  import('../features/servers/ServerChannelsPage').then((m) => ({
    default: m.ServerChannelsPage,
  })),
);
const ServerVoicePage = lazy(() =>
  import('../features/servers/ServerVoicePage').then((m) => ({ default: m.ServerVoicePage })),
);
const ServerSettingsLayout = lazy(() =>
  import('../features/servers/settings/ServerSettingsLayout').then((m) => ({
    default: m.ServerSettingsLayout,
  })),
);

function RecentRedirect() {
  const recentPath = useWorkspaceStore((s) => s.recentPath);
  const to = recentPath ?? 'friends';
  return <Navigate to={to} replace />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnlyRoute>
            <RegisterPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicOnlyRoute>
            <ForgotPasswordPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicOnlyRoute>
            <ResetPasswordPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<RecentRedirect />} />
        <Route
          path="friends"
          element={
            <RouteContainer>
              <FriendsPage />
            </RouteContainer>
          }
        />
        <Route
          path="dm/:conversationId"
          element={
            <RouteContainer>
              <MessagesPage />
            </RouteContainer>
          }
        />
        <Route
          path="servers/:serverId/channels/:channelId"
          element={
            <RouteContainer>
              <ServerChannelsPage />
            </RouteContainer>
          }
        />
        <Route
          path="servers/:serverId/voice/:channelId"
          element={
            <RouteContainer>
              <ServerVoicePage />
            </RouteContainer>
          }
        />
        <Route
          path="servers/:serverId/settings"
          element={
            <RouteContainer>
              <ServerSettingsLayout />
            </RouteContainer>
          }
        >
          <Route index element={<Navigate to="roles" replace />} />
          <Route path="roles" element={<RolesTab />} />
          <Route path="members" element={<MembersTab />} />
          <Route path="channels" element={<ChannelsTab />} />
        </Route>
        <Route
          path="notifications"
          element={
            <RouteContainer>
              <NotificationsPage />
            </RouteContainer>
          }
        />
        <Route path="*" element={<Navigate to="friends" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
