import { Shield } from 'lucide-react';
import { EmptyState } from '../../shared/components/EmptyState';

export function PermissionsPage() {
  return (
    <EmptyState
      icon={Shield}
      title="权限管理"
      description="角色与权限管理即将在 M4 上线"
    />
  );
}
