import {
  userSummarySchema,
  type UserSummary,
  type UpdateProfileRequest,
  type UpdatePresenceRequest,
} from '@eiscord/shared';
import { request } from '../../shared/api/http-client';

export function fetchCurrentUser(): Promise<UserSummary> {
  return request<UserSummary>('GET', '/users/me', { schema: userSummarySchema });
}

export function updateProfile(input: UpdateProfileRequest): Promise<UserSummary> {
  return request<UserSummary>('PATCH', '/users/me/profile', {
    body: input,
    schema: userSummarySchema,
  });
}

export function updatePresence(input: UpdatePresenceRequest): Promise<UserSummary> {
  return request<UserSummary>('PATCH', '/users/me/presence', {
    body: input,
    schema: userSummarySchema,
  });
}
