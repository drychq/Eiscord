import { create } from 'zustand';

export type ThemePreference = 'dark' | 'light' | 'system';

const THEME_STORAGE_KEY = 'eiscord.theme';

function loadInitial(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'dark' || raw === 'light' || raw === 'system') return raw;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[theme] localStorage read failed', error);
    }
  }
  return 'dark';
}

function persist(value: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, value);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[theme] localStorage write failed', error);
    }
  }
}

export type ThemeState = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

export const useThemeStore = create<ThemeState>((set) => ({
  preference: loadInitial(),
  setPreference: (preference) => {
    persist(preference);
    set({ preference });
  },
}));
