import { AuthenticatedUserContext } from '../auth/auth.types';

export const PermissionAction = {
  AccessAttachment: 'ACCESS_ATTACHMENT',
  CreateInvite: 'CREATE_INVITE',
  JoinVoice: 'JOIN_VOICE',
  ListenVoice: 'LISTEN_VOICE',
  ManageChannel: 'MANAGE_CHANNEL',
  ManageMember: 'MANAGE_MEMBER',
  ManageMessage: 'MANAGE_MESSAGE',
  ManageRole: 'MANAGE_ROLE',
  SendMessage: 'SEND_MESSAGE',
  SpeakVoice: 'SPEAK_VOICE',
  SubscribeRealtime: 'SUBSCRIBE_REALTIME',
  ViewAudit: 'VIEW_AUDIT',
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

export type PermissionDecision = {
  allowed: boolean;
  reason?: string;
};
