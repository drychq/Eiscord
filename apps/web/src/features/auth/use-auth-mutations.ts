import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../shared/state/use-auth-store';
import { useToastStore } from '../../shared/state/use-toast-store';
import * as socket from '../../shared/api/socket-client';
import { formatErrorMessage } from '../../shared/utils/error-message';
import {
  confirmPasswordReset,
  loginUser,
  logoutUser,
  registerUser,
  requestPasswordReset,
} from './auth-api';
import type {
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  ResetPasswordRequest,
} from '@eiscord/shared';

export function useLoginMutation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LoginRequest) => loginUser(input),
    onSuccess: (data: LoginResponse) => {
      setSession({
        access: data.access_token,
        refresh: data.refresh_token,
        user: data.user,
      });
      socket.connect(data.access_token);

      if (Array.isArray(data.servers) && data.servers.length > 0) {
        queryClient.setQueryData(['servers'], data.servers);
      }
      if (Array.isArray(data.friends) && data.friends.length > 0) {
        queryClient.setQueryData(['friends'], data.friends);
      }

      const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
      navigate(from ?? '/app', { replace: true });
    },
  });
}

export function useRegisterMutation() {
  const navigate = useNavigate();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: (input: RegisterRequest) => registerUser(input),
    onSuccess: () => {
      pushToast({ kind: 'success', message: '注册成功，请登录', ttl: 3000 });
      navigate('/login', { replace: true });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useLogoutMutation() {
  const navigate = useNavigate();
  const { clearSession } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => logoutUser().catch(() => ({ ok: true } as const)),
    onSettled: () => {
      socket.disconnect();
      clearSession();
      queryClient.clear();
      navigate('/login', { replace: true });
    },
  });
}

export function useRequestPasswordResetMutation() {
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: (input: ForgotPasswordRequest) => requestPasswordReset(input),
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}

export function useConfirmPasswordResetMutation() {
  const navigate = useNavigate();
  const { pushToast } = useToastStore();

  return useMutation({
    mutationFn: (input: ResetPasswordRequest) => confirmPasswordReset(input),
    onSuccess: () => {
      pushToast({ kind: 'success', message: '密码已重置，请用新密码登录', ttl: 4000 });
      navigate('/login', { replace: true });
    },
    onError: (error) => {
      pushToast({ kind: 'error', message: formatErrorMessage(error), ttl: 5000 });
    },
  });
}
