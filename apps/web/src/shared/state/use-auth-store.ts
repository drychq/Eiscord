import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserSummary } from '@eiscord/shared';

export type AuthStatus = 'idle' | 'authenticated' | 'expired';

export type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  currentUser: UserSummary | null;
  status: AuthStatus;

  setSession: (session: {
    access: string;
    refresh: string;
    user: UserSummary;
  }) => void;
  updateUser: (user: UserSummary) => void;
  clearSession: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      currentUser: null,
      status: 'idle',

      setSession: ({ access, refresh, user }) =>
        set({
          accessToken: access,
          refreshToken: refresh,
          currentUser: user,
          status: 'authenticated',
        }),

      updateUser: (user) => set({ currentUser: user }),

      clearSession: () =>
        set({
          accessToken: null,
          refreshToken: null,
          currentUser: null,
          status: 'idle',
        }),
    }),
    {
      name: 'eiscord:auth',
    },
  ),
);
