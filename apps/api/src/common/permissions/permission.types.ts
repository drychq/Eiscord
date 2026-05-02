import { AuthenticatedUserContext } from '../auth/auth.types';

export const PermissionAction = {
  AccessAttachment: 'ACCESS_ATTACHMENT',
  DeleteMessage: 'DELETE_MESSAGE',
  JoinVoice: 'JOIN_VOICE',
  ManageChannel: 'MANAGE_CHANNEL',
  ManageMember: 'MANAGE_MEMBER',
  ManageRole: 'MANAGE_ROLE',
  SendMessage: 'SEND_MESSAGE',
  SubscribeRealtime: 'SUBSCRIBE_REALTIME',
  ViewChannel: 'VIEW_CHANNEL',
  ViewMembers: 'VIEW_MEMBERS',
} as const;

export type PermissionAction = (typeof PermissionAction)[keyof typeof PermissionAction];

export type PermissionResourceType =
  | 'attachment'
  | 'channel'
  | 'dm'
  | 'message'
  | 'server'
  | 'user'
  | 'voice';

export type PermissionResource = {
  id: string;
  type: PermissionResourceType;
};

export type PermissionCheckInput = {
  action: PermissionAction;
  requestId?: string;
  resource: PermissionResource;
  user: AuthenticatedUserContext;
};
