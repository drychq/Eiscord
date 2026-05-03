import {
  loginResponseSchema,
  registerResponseSchema,
  logoutResponseSchema,
  type LoginRequest,
  type LoginResponse,
  type RegisterRequest,
  type RegisterResponse,
} from '@eiscord/shared';
import { request } from '../../shared/api/http-client';

export function registerUser(input: RegisterRequest): Promise<RegisterResponse> {
  return request<RegisterResponse>('POST', '/auth/register', {
    body: input,
    schema: registerResponseSchema,
  });
}

export function loginUser(input: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('POST', '/auth/login', {
    body: input,
    schema: loginResponseSchema,
  });
}

export function refreshSession(refreshToken: string): Promise<LoginResponse> {
  return request<LoginResponse>('POST', '/auth/refresh', {
    body: { refresh_token: refreshToken },
    schema: loginResponseSchema,
  });
}

export function logoutUser(): Promise<{ ok: true }> {
  return request<{ ok: true }>('POST', '/auth/logout', {
    schema: logoutResponseSchema,
  });
}
