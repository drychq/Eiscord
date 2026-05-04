import { Shield } from 'lucide-react';
import { EmptyState } from '../../shared/components/EmptyState';

export function PermissionsPage() {
  return (
    <EmptyState
      icon={Shield}
      title="权限管理"
      description="权限管理功能已集成至社区设置页面，请通过社区设置中的角色与频道管理进行配置。"
    />
  );
}
