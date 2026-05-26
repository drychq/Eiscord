import {
  forgotPasswordResponseSchema,
  loginResponseSchema,
  logoutResponseSchema,
  registerResponseSchema,
  resetPasswordResponseSchema,
  type ForgotPasswordRequest,
  type ForgotPasswordResponse,
  type LoginRequest,
  type LoginResponse,
  type RegisterRequest,
  type RegisterResponse,
  type ResetPasswordRequest,
  type ResetPasswordResponse,
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

export function requestPasswordReset(
  input: ForgotPasswordRequest,
): Promise<ForgotPasswordResponse> {
  return request<ForgotPasswordResponse>('POST', '/auth/forgot-password', {
    body: input,
    schema: forgotPasswordResponseSchema,
  });
}

export function confirmPasswordReset(
  input: ResetPasswordRequest,
): Promise<ResetPasswordResponse> {
  return request<ResetPasswordResponse>('POST', '/auth/reset-password', {
    body: input,
    schema: resetPasswordResponseSchema,
  });
}
