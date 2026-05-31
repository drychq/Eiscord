import { useOutletContext } from 'react-router-dom';
import type { ServerDetail, RoleSummary } from '../servers-api';

export type ServerSettingsContext = {
  serverId: string;
  server: ServerDetail;
  roles: RoleSummary[];
  canManageRole: boolean;
  canManageMember: boolean;
  canManageChannel: boolean;
  canCreateInvite: boolean;
};

export function useServerSettingsContext(): ServerSettingsContext {
  return useOutletContext<ServerSettingsContext>();
}
