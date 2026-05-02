export const ChannelType = {
  Text: 'TEXT',
  Voice: 'VOICE',
} as const;

export type ChannelType = (typeof ChannelType)[keyof typeof ChannelType];

export const PresenceStatus = {
  Online: 'ONLINE',
  Idle: 'IDLE',
  Busy: 'BUSY',
  Invisible: 'INVISIBLE',
  Offline: 'OFFLINE',
} as const;

export type PresenceStatus = (typeof PresenceStatus)[keyof typeof PresenceStatus];

export const FriendshipStatus = {
  Pending: 'PENDING',
  Accepted: 'ACCEPTED',
  Rejected: 'REJECTED',
  Deleted: 'DELETED',
} as const;

export type FriendshipStatus = (typeof FriendshipStatus)[keyof typeof FriendshipStatus];

export const MessageVisibility = {
  Visible: 'VISIBLE',
  Withdrawn: 'WITHDRAWN',
  Deleted: 'DELETED',
} as const;

export type MessageVisibility = (typeof MessageVisibility)[keyof typeof MessageVisibility];

export const VoiceConnectionStatus = {
  Connecting: 'CONNECTING',
  Connected: 'CONNECTED',
  Reconnecting: 'RECONNECTING',
  Disconnected: 'DISCONNECTED',
} as const;

export type VoiceConnectionStatus =
  (typeof VoiceConnectionStatus)[keyof typeof VoiceConnectionStatus];

export const NotificationType = {
  FriendRequest: 'FRIEND_REQUEST',
  DirectMessage: 'DIRECT_MESSAGE',
  ChannelMention: 'CHANNEL_MENTION',
  ServerInvite: 'SERVER_INVITE',
  PermissionChanged: 'PERMISSION_CHANGED',
  VoiceState: 'VOICE_STATE',
} as const;

export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
