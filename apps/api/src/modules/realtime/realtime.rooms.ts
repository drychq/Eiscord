import { RealtimeScopeType } from '@eiscord/shared';

export function buildRealtimeRoom(scopeType: RealtimeScopeType, scopeId: string): string {
  return `${scopeType}:${scopeId}`;
}

export function buildUserRoom(userId: string): string {
  return buildRealtimeRoom('user', userId);
}
