import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '../shared/components/ProtectedRoute';
import { PublicOnlyRoute } from '../shared/components/PublicOnlyRoute';
import { AppShell } from '../shared/components/AppShell';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { FriendsPage } from '../features/friends/FriendsPage';
import { MessagesPage } from '../features/messages/MessagesPage';
import { NotificationsPage } from '../features/notifications/NotificationsPage';
import { ServerChannelsPage } from '../features/servers/ServerChannelsPage';
import { ServerVoicePage } from '../features/servers/ServerVoicePage';
import { ServerSettingsPage } from '../features/servers/ServerSettingsPage';
import { useWorkspaceStore } from '../shared/state/use-workspace-store';

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
        <Route path="friends" element={<FriendsPage />} />
        <Route path="dm/:conversationId" element={<MessagesPage />} />
        <Route path="servers/:serverId/channels/:channelId" element={<ServerChannelsPage />} />
        <Route path="servers/:serverId/voice/:channelId" element={<ServerVoicePage />} />
        <Route path="servers/:serverId/settings" element={<ServerSettingsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="*" element={<Navigate to="friends" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
