import { Settings } from 'lucide-react';
import { EmptyState } from '../../shared/components/EmptyState';

export function ServerSettingsPage() {
  return (
    <EmptyState
      icon={Settings}
      title="社区设置"
      description="社区管理功能即将在 M4 上线"
    />
  );
}
