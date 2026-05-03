import {
  userSummarySchema,
  type UserSummary,
  type UpdateProfileRequest,
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
