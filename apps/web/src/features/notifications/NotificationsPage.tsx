import { Bell } from 'lucide-react';
import { EmptyState } from '../../shared/components/EmptyState';

export function NotificationsPage() {
  return (
    <EmptyState
      icon={Bell}
      title="通知"
      description="通知功能即将在 M3 上线"
    />
  );
}
