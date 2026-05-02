export enum ChannelType {
  Text = 'TEXT',
  Voice = 'VOICE',
}

export enum PresenceStatus {
  Online = 'ONLINE',
  Idle = 'IDLE',
  DoNotDisturb = 'DO_NOT_DISTURB',
  Invisible = 'INVISIBLE',
  Offline = 'OFFLINE',
}

export enum FriendshipStatus {
  Pending = 'PENDING',
  Accepted = 'ACCEPTED',
  Rejected = 'REJECTED',
  Blocked = 'BLOCKED',
}

export enum MessageVisibility {
  Visible = 'VISIBLE',
  Withdrawn = 'WITHDRAWN',
  Deleted = 'DELETED',
}

export enum VoiceConnectionStatus {
  Connecting = 'CONNECTING',
  Connected = 'CONNECTED',
  Reconnecting = 'RECONNECTING',
  Disconnected = 'DISCONNECTED',
}

export enum NotificationType {
  FriendRequest = 'FRIEND_REQUEST',
  DirectMessage = 'DIRECT_MESSAGE',
  ChannelMention = 'CHANNEL_MENTION',
  ServerInvite = 'SERVER_INVITE',
  PermissionChanged = 'PERMISSION_CHANGED',
  VoiceState = 'VOICE_STATE',
}
