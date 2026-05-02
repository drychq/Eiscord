export const RealtimeEvent = {
  MessageCreated: 'MessageCreated',
  MessageDeleted: 'MessageDeleted',
  UnreadUpdated: 'UnreadUpdated',
  PermissionChanged: 'PermissionChanged',
  NotificationCreated: 'NotificationCreated',
  PresenceChanged: 'PresenceChanged',
  ChannelChanged: 'ChannelChanged',
  MemberJoined: 'MemberJoined',
  MemberChanged: 'MemberChanged',
  VoiceMemberJoined: 'VoiceMemberJoined',
  VoiceMemberLeft: 'VoiceMemberLeft',
  VoiceStateChanged: 'VoiceStateChanged',
} as const;

export type RealtimeEvent = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];
